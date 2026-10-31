#!/usr/bin/env python3
"""visual-tracert's vrnetlab: MikroTik RouterOS (CHR) as a device of a lab.

The container is the device. The emulator moves the lab's cables into it
(its ports) after it starts; this waits for them, then runs the virtual
machine (with KVM when the server has it): one virtual NIC per port, joined
to its port with tc (every frame, both ways), and a last one for management
(SSH, reachable from inside the container only). Once RouterOS boots, it
logs in on the serial console, sets the password, the management and the
lab's configuration, makes sure its SSH answers, and leaves the console free.

Its environment, set by the emulator:
  VR_PORTS   the device's ports in order, "name=mac" separated by spaces:
             the first is RouterOS's ether1, the second ether2…
  VR_WAIT    the cabled ones, which appear after the container starts
  VR_CONFIG  RouterOS commands, one per line, in base64
  VR_MEMORY  the machine's memory, in MB
  VR_CPUS    its processors (2: with one, a busy RouterOS stops answering
             on its console)
"""
import base64
import os
import re
import signal
import socket
import subprocess
import sys
import time

RUN = "/run/vr"
CONSOLE = f"{RUN}/console.sock"
READY = f"{RUN}/ready"
PASSWORD = os.environ.get("VR_PASSWORD", "admin")
MGMT = "vt-mgmt"
VRF = "vt-vrf-mgmt"
LOGIN = re.compile(rb"Login: ?$")
CRASHED = re.compile(rb"Console (has crashed|does not respond)")
PROMPT = re.compile(rb"\[admin@[^\]\r\n]+\] [^\r\n]*> ?$")
ERROR = re.compile(rb"(failure:|bad command name|syntax error|expected |no such item|invalid value|ambiguous value|input does not match)", re.I)


def log(message):
    print(f"[vrnetlab] {message}", flush=True)


def sh(*args):
    subprocess.run(args, check=True)


def ports():
    """The device's ports, in order: (name, mac)."""
    pairs = [item.split("=", 1) for item in os.environ.get("VR_PORTS", "").split()]
    return [(name, mac) for name, mac in pairs]


def wait_cables(timeout=120):
    """The cabled ports, once the emulator has moved them in."""
    wanted = os.environ.get("VR_WAIT", "").split()
    deadline = time.time() + timeout
    while True:
        missing = [name for name in wanted if not os.path.exists(f"/sys/class/net/{name}")]
        if not missing:
            return
        if time.time() > deadline:
            log(f"sin cable tras {timeout} s: {' '.join(missing)}")
            return
        time.sleep(0.3)


def wire(index, name, mac):
    """A tap for a port's NIC; joined to the port, if it is cabled."""
    tap = f"vrtap{index}"
    sh("ip", "tuntap", "add", tap, "mode", "tap")
    sh("ip", "link", "set", tap, "up")
    if os.path.exists(f"/sys/class/net/{name}"):
        sh("ip", "link", "set", name, "up")
        for source, target in ((name, tap), (tap, name)):
            sh("tc", "qdisc", "add", "dev", source, "ingress")
            sh("tc", "filter", "add", "dev", source, "parent", "ffff:", "protocol", "all",
               "u32", "match", "u8", "0", "0", "action", "mirred", "egress", "redirect", "dev", target)
    return ["-netdev", f"tap,id=p{index},ifname={tap},script=no,downscript=no",
            "-device", f"virtio-net-pci,netdev=p{index},mac={mac}"]


def machine(nics):
    """The QEMU command: its machine for this server's architecture."""
    kvm = os.path.exists("/dev/kvm")
    if not kvm:
        log("sin /dev/kvm: la máquina se emula (mucho más lenta)")
    memory = os.environ.get("VR_MEMORY", "512")
    if os.uname().machine == "aarch64":
        command = ["qemu-system-aarch64", "-machine", "virt,gic-version=host" if kvm else "virt",
                   "-cpu", "host" if kvm else "max", "-bios", "/usr/share/AAVMF/QEMU_EFI.fd",
                   "-drive", "if=virtio,format=qcow2,file=/vr/disk.qcow2"]
    else:
        command = ["qemu-system-x86_64", "-machine", "pc", "-cpu", "host" if kvm else "qemu64",
                   "-drive", "if=ide,format=qcow2,file=/vr/disk.qcow2"]
    if kvm:
        command.append("-enable-kvm")
    return command + [
        "-m", memory, "-smp", os.environ.get("VR_CPUS", "2"), "-nodefaults", "-display", "none", "-monitor", "none",
        "-chardev", f"socket,id=console,path={CONSOLE},server=on,wait=off", "-serial", "chardev:console",
        *nics,
        # management: SSH from this container, on the last NIC
        "-netdev", "user,id=mgmt,net=10.0.2.0/24,hostfwd=tcp:127.0.0.1:2022-10.0.2.15:22",
        "-device", "virtio-net-pci,netdev=mgmt,mac=52:54:00:00:01:01",
    ]


class Console:
    """RouterOS's serial console, spoken to as a terminal would."""

    def __init__(self, path, transcript):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        for _ in range(100):
            try:
                self.sock.connect(path)
                break
            except OSError:
                time.sleep(0.2)
        self.buffer = b""
        self.transcript = transcript

    def send(self, text):
        self.sock.sendall(text.encode())

    def expect(self, patterns, timeout, quiet=0.6):
        """Reads until one of the patterns ends what came, and nothing more
        comes for a moment (RouterOS draws its prompts twice): its index, and the text."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            matched = next((index for index, pattern in enumerate(patterns) if re.search(pattern, self.buffer)), None)
            self.sock.settimeout(1 if matched is None else quiet)
            try:
                chunk = self.sock.recv(4096)
            except socket.timeout:
                if matched is not None:
                    text, self.buffer = self.buffer, b""
                    return matched, text
                continue
            if not chunk:
                raise EOFError("la consola se cerró")
            self.transcript.write(chunk)
            self.transcript.flush()
            self.buffer = (self.buffer + chunk)[-8192:]
        raise TimeoutError(f"la consola no mostró {patterns!r}")

    def close(self):
        self.sock.close()


def login(console, fresh, shown=False):
    """In as admin: the first time with no password (the licence asked, the
    password set), later with it."""
    if not shown:
        console.expect([LOGIN], 600)
    # +c no colours, +t no terminal detection, +e a plain terminal: easy to read
    console.send("admin+cte\r")
    console.expect([rb"Password: ?$"], 30)
    console.send(("" if fresh else PASSWORD) + "\r")
    while True:
        index, _ = console.expect([rb"\[Y/n\]:? ?$", rb"new password> ?$", PROMPT, LOGIN], 60)
        if index == 0:
            console.send("n")
        elif index == 1:
            # "new password>", then "repeat new password>"
            console.send(PASSWORD + "\r")
        elif index == 2:
            return
        else:
            raise RuntimeError("RouterOS no aceptó el usuario admin")


def command(console, line):
    """One command: what it printed, and whether it had to be sent again.
    Busy, RouterOS may find its console not responding: it reconnects it
    (the command lost) or restarts it (asking first, sometimes), which logs
    out; then in again if it must, and the command again."""
    for attempt in range(3):
        console.send(line + "\r")
        index, text = console.expect([PROMPT, LOGIN, rb"\[y/N\] ?$"], 120)
        if index == 0 and not CRASHED.search(text):
            return text, attempt > 0
        if index == 2:
            console.send("y")
        log(f"la consola se reinició durante «{line}»: otra vez")
        if index != 0:
            login(console, fresh=False, shown=index == 1)
    raise RuntimeError(f"la consola no respondió a «{line}»")


def ssh_answers():
    """Whether vr-cli gets in: RouterOS's SSH, on the management NIC."""
    try:
        done = subprocess.run(
            ["sshpass", "-p", PASSWORD, "ssh", "-T", "-p", "2022", "-o", "StrictHostKeyChecking=no",
             "-o", "UserKnownHostsFile=/dev/null", "-o", "LogLevel=ERROR", "-o", "ConnectTimeout=10",
             "admin+ct@127.0.0.1", ":put vt-ok"], capture_output=True, timeout=40)
        return b"vt-ok" in done.stdout
    except subprocess.TimeoutExpired:
        return False


def configure(console, count):
    """Management, then the lab's own configuration; then, until its SSH
    answers, management again (a command may have been lost)."""
    # its login shows before it has found every NIC
    for _ in range(60):
        text, _ = command(console, ":put [/interface ethernet print count-only]")
        found = re.search(rb"^(\d+)\s*$", text.replace(b"\r", b""), re.M)
        if found and int(found.group(1)) > count:
            break
        time.sleep(1)
    management = [
        "/ip dhcp-client remove [find]",
        f"/interface ethernet set [find default-name=ether{count + 1}] name={MGMT}",
        f"/ip vrf add name={VRF} interfaces={MGMT}",
        f"/ip address add address=10.0.2.15/24 interface={MGMT}",
        f"/ip service set ssh vrf={VRF}",
    ]
    lab = base64.b64decode(os.environ.get("VR_CONFIG", "")).decode().splitlines()
    errors = []
    for line in management + [line for line in lab if line.strip()]:
        text, again = command(console, line)
        # sent again, it may have been done the first time
        if ERROR.search(text) and not (again and b"already" in text):
            errors.append(text.decode(errors="replace").strip())
            log(f"error en «{line}»")
    for _ in range(3):
        if ssh_answers():
            return errors
        log("su SSH no responde: la gestión otra vez")
        for line in management:
            command(console, line)
    errors.append("El SSH de gestión no responde: usa la consola serie.")
    return errors


def main():
    os.makedirs(RUN, exist_ok=True)
    for path in (READY, CONSOLE):
        if os.path.exists(path):
            os.remove(path)
    # each start, a fresh disk over the image's: the machine starts as new
    sh("qemu-img", "create", "-q", "-f", "qcow2", "-b", "/vr/chr.img", "-F", "raw", "/vr/disk.qcow2")

    wait_cables()
    listed = ports()
    nics = [arg for index, (name, mac) in enumerate(listed) for arg in wire(index, name, mac)]
    argv = machine(nics)
    log(" ".join(argv))
    qemu = subprocess.Popen(argv)
    signal.signal(signal.SIGTERM, lambda *_: qemu.terminate())

    started = time.time()
    with open(f"{RUN}/console.log", "ab") as transcript:
        try:
            console = Console(CONSOLE, transcript)
            login(console, fresh=True)
            log(f"RouterOS arrancó en {time.time() - started:.0f} s")
            errors = configure(console, len(listed))
            console.send("/quit\r")
            console.close()
            with open(READY, "w") as ready:
                ready.write("\n".join(errors))
            log("configurado" + (f", con {len(errors)} errores" if errors else ""))
        except Exception as error:  # the machine stays up: its console says more
            log(f"no se pudo configurar: {error}")
            with open(READY, "w") as ready:
                ready.write(str(error))
    sys.exit(qemu.wait())


if __name__ == "__main__":
    main()
