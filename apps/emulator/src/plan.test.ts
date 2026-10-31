import { describe, expect, it } from "vitest";
import { CATALOG, exampleTopology, GROUPS, IMAGES, PALETTE, templateById, updateDevice, updateZone } from "@visual-tracert/model";
import { argvOf, routerosOf } from "./lab";
import { containerName, ifnameOf, planLab } from "./plan";

const open = (id: string) => templateById(id)!.build();
const node = (plan: ReturnType<typeof planLab>, device: string) => plan.nodes.find(item => item.device === device)!;

describe("planLab", () => {
  it("makes one container per device and one veth pair per cable", () => {
    const topology = open("cadena-routers");
    const plan = planLab("lab-1", topology);
    expect(plan.nodes).toHaveLength(topology.devices.length);
    expect(plan.links).toHaveLength(topology.links.length);
    expect(node(plan, "r1").container).toBe("vt-lab-1-r1");
    // the temporary names are unique and fit in 15 characters
    const temps = plan.links.flatMap(link => [link.a.temp, link.b.temp]);
    expect(new Set(temps).size).toBe(temps.length);
    expect(temps.every(name => name.length <= 15)).toBe(true);
  });

  it("names the ports as Linux allows and keeps their MAC and real name", () => {
    const plan = planLab("lab", open("cadena-routers"));
    const r1 = node(plan, "r1").script.join("\n");
    expect(r1).toMatch(/ip link set vt[0-9a-f]{8}[ab] name Gi0-0/);
    expect(r1).toContain("alias 'Gi0/0'");
    expect(r1).toContain("ip addr add 172.16.1.1/24 dev Gi0-0");
  });

  it("turns routers into forwarding Linux routers with their static routes", () => {
    const plan = planLab("lab", open("cadena-routers"));
    const r1 = node(plan, "r1").script;
    expect(r1).toContain("sysctl -qw net.ipv4.ip_forward=1");
    expect(r1).toContain("ip route replace 172.16.3.0/24 via 10.0.12.2");
    expect(node(plan, "r3").script).toContain("ip route replace default via 10.0.23.1");
    expect(node(plan, "pc").script).toContain("ip route replace default via 172.16.1.1");
    expect(node(plan, "pc").script).not.toContain("sysctl -qw net.ipv4.ip_forward=1");
  });

  it("turns switches into a bridge with the access VLAN of each port", () => {
    const script = node(planLab("lab", open("vlans")), "switch").script;
    expect(script).toContain("ip link add br0 type bridge vlan_filtering 1");
    expect(script).toContain("bridge vlan add vid 10 dev Fa0-1 pvid untagged");
    expect(script).toContain("bridge vlan add vid 20 dev Fa0-3 pvid untagged");
    // uncabled ports are not created
    expect(script.join("\n")).not.toContain("Fa0-8");
  });

  it("warns about what it does not emulate yet, and skips what cannot work", () => {
    const plan = planLab("lab", exampleTopology());
    expect(plan.warnings.some(text => /Smartphone 1.*DHCP/.test(text))).toBe(true);
    expect(plan.warnings.some(text => /Servidor DNS.*servicios/.test(text))).toBe(true);
    expect(plan.warnings.some(text => /relay DHCP/.test(text))).toBe(true);
    const broken = updateDevice(open("dos-redes"), "pc-a1", device => ({ ...device, gateway: "10.9.9.9" }));
    const skipped = planLab("lab", broken);
    expect(node(skipped, "pc-a1").script.join("\n")).not.toContain("default via");
    expect(skipped.warnings.join(" ")).toMatch(/10\.9\.9\.9/);
  });

  it("runs each device as the image of its type, generic ones as Alpine", () => {
    const topology = updateDevice(open("lan-basica"), "pc-1", device => ({ ...device, type: "alpine" }));
    const plan = planLab("lab", topology);
    expect(plan.nodes.every(item => item.image === IMAGES.alpine.ref)).toBe(true);
    expect(node(plan, "pc-1").script).toContain("ip addr add 192.168.1.11/24 dev eth0");
  });

  it("builds only what the topologies start, and the cables between it", () => {
    const hybrid = updateDevice(updateZone(exampleTopology(), "internet", zone => ({ ...zone, status: "hybrid" })), "dns", device => ({ ...device, status: "up" }));
    const plan = planLab("lab", hybrid);
    expect(plan.nodes.map(item => item.device)).toContain("dns");
    expect(plan.nodes.map(item => item.device)).not.toContain("isp");
    expect(plan.links.some(link => link.a.device === "isp" || link.b.device === "isp")).toBe(false);
    expect(plan.warnings.join(" ")).toMatch(/No se inician.*ISP/);
  });

  it("runs each image as it needs, and a device's profile once it is built", () => {
    const topology = updateDevice(updateDevice(open("lan-basica"), "pc-1", device => ({ ...device, type: "frr", profile: "frr-ospf" })), "pc-2", device => ({ ...device, profile: "ubuntu-red" }));
    const profile = (id: string, base: "frr" | "ubuntu") => ({ id, name: id, base, packages: [], setup: [], startup: ["echo hola"] });
    const plan = planLab("lab", topology, undefined, new Map([
      ["frr-ospf", { profile: profile("frr-ospf", "frr"), ready: true }],
      ["ubuntu-red", { profile: profile("ubuntu-red", "ubuntu"), ready: false }],
    ]));
    const frr = node(plan, "pc-1");
    expect(frr).toMatchObject({ image: "visual-tracert/profile-frr-ospf:latest", imageId: "frr", run: "image", caps: ["SYS_ADMIN"], memory: 160 });
    expect(frr.startup).toEqual(["touch /etc/frr/vtysh.conf", "echo hola"]);
    // not built: the image of its type, and a warning
    expect(node(plan, "pc-2")).toMatchObject({ image: "alpine:3.20", run: "sleep" });
    expect(plan.warnings.join(" ")).toMatch(/ubuntu-red.*no está construido/);
  });

  it("configures SR Linux through sr_cli, and runs it only where privileged containers are allowed", () => {
    const topology = updateDevice(open("cadena-routers"), "r2", device => ({
      ...device, type: "srlinux",
      interfaces: device.interfaces.map((iface, i) => ({ ...iface, name: `e1-${i + 1}` })),
    }));
    const fixed = { ...topology, links: topology.links.map(link => ({
      ...link,
      a: link.a.device === "r2" ? { ...link.a, interface: `e1-${Number(link.a.interface.split("/")[1]) + 1}` } : link.a,
      b: link.b.device === "r2" ? { ...link.b, interface: `e1-${Number(link.b.interface.split("/")[1]) + 1}` } : link.b,
    })) };
    const refused = planLab("lab", fixed);
    expect(refused.nodes.map(item => item.device)).not.toContain("r2");
    expect(refused.warnings.join(" ")).toMatch(/privilegiado.*R2|privilegiado.*Router 2/);
    const plan = planLab("lab", fixed, undefined, undefined, { allowPrivileged: true });
    const r2 = node(plan, "r2");
    expect(r2).toMatchObject({ privileged: true, imageId: "srlinux", user: "0", memory: 2048 });
    // no Linux addresses: they go in through its CLI
    expect(r2.script.join("\n")).not.toContain("ip addr add");
    const startup = r2.startup.join("\n");
    expect(startup).toMatch(/set \/ interface ethernet-1\/1 subinterface 0 ipv4 address 10\.0\.12\.2\/30/);
    expect(startup).toMatch(/static-routes route 172\.16\.\d\.0\/24 next-hop-group vt-1/);
    expect(startup).toContain("sr_cli source /tmp/visual-tracert.cfg");
  });

  it("runs RouterOS as a virtual machine its launcher wires and configures", () => {
    const topology = updateDevice(open("cadena-routers"), "r2", device => ({ ...device, type: "routeros", name: 'R2 "core"' }));
    const r2 = node(planLab("lab", topology), "r2");
    expect(r2).toMatchObject({ run: "vm", imageId: "routeros", image: IMAGES.routeros.ref, memory: 512, startup: [] });
    // Linux leaves the ports to the machine: no address, no IPv6
    const script = r2.script.join("\n");
    expect(script).not.toContain("ip addr add");
    expect(script).toMatch(/disable_ipv6=1/);
    const env = Object.fromEntries(r2.env!.map(item => item.split(/=(.*)/s).slice(0, 2)));
    // every port in order, the first one ether1; the cabled ones awaited
    const device = topology.devices.find(item => item.id === "r2")!;
    expect(env.VR_PORTS.split(" ")).toEqual(device.interfaces.map(iface => `${iface.name.replace("/", "-")}=${iface.mac}`));
    expect(env.VR_WAIT.split(" ").length).toBe(topology.links.filter(link => link.a.device === "r2" || link.b.device === "r2").length);
    const config = Buffer.from(env.VR_CONFIG, "base64").toString();
    expect(config).toContain('/system identity set name="R2 \\"core\\""');
    expect(config).toContain('/interface ethernet set [find default-name=ether1] name="Gi0/0"');
    expect(config).toMatch(/\/ip address add address=10\.0\.12\.2\/30 interface="Gi0\/\d"/);
    expect(config).toMatch(/\/ip route add dst-address=172\.16\.\d\.0\/24 gateway=10\.0\.\d+\.\d+/);
  });

  it("quotes what comes from the document", () => {
    const topology = updateDevice(open("lan-basica"), "pc-1", device => ({
      ...device, interfaces: device.interfaces.map(iface => ({ ...iface, name: "it's; rm -rf /" })),
    }));
    const fixed = { ...topology, links: topology.links.map(link => link.b.device === "pc-1" ? { ...link, b: { ...link.b, interface: "it's; rm -rf /" } } : link) };
    const script = node(planLab("lab", fixed), "pc-1").script.join("\n");
    expect(script).toContain("alias 'it'\\''s; rm -rf /'");
    expect(script).toContain("name it-s--rm--rf--");
  });
});

describe("names", () => {
  it("fits Linux interface names in 15 characters, unique per device", () => {
    const taken = new Set<string>();
    expect(ifnameOf("GigabitEthernet0/0/0", taken)).toBe("GigabitEthernet");
    expect(ifnameOf("GigabitEthernet0/0/1", taken)).toBe("GigabitEtherne1");
    expect(ifnameOf("lo", taken)).toBe("lo1");
  });

  it("keeps container names inside Docker's alphabet", () => {
    expect(containerName("lab-Ab_1", "Servidor DNS")).toBe("vt-lab-ab-1-servidor-dns");
  });
});

describe("commands", () => {
  it("says the same commands in RouterOS's CLI", () => {
    expect(routerosOf("ping", "10.0.0.1")).toBe("/ping 10.0.0.1 count=4");
    expect(routerosOf("routes", undefined)).toBe("/ip route print");
    expect(routerosOf("ping", "1.2.3.4; /system reset-configuration")).toBeNull();
  });

  it("only runs known commands, with a checked target", () => {
    expect(argvOf("ping", "8.8.8.8")).toEqual(["ping", "-c", "4", "-W", "2", "8.8.8.8"]);
    expect(argvOf("traceroute", "www.ejemplo.com")?.at(-1)).toBe("www.ejemplo.com");
    expect(argvOf("ping", "8.8.8.8; reboot")).toBeNull();
    expect(argvOf("ping", "-f")).toBeNull();
    expect(argvOf("routes", undefined)).toEqual(["ip", "route"]);
  });
});

describe("catalog", () => {
  it("puts every device type in a group shown in the palette, with an image", () => {
    expect(new Set(PALETTE)).toEqual(new Set(Object.keys(CATALOG)));
    for(const type of PALETTE){
      expect(GROUPS.map(group => group.id)).toContain(CATALOG[type].group);
      expect(IMAGES[CATALOG[type].image].links.every(link => link.url.startsWith("https://"))).toBe(true);
    }
    expect(CATALOG.alpine.group).toBe("images");
    expect(CATALOG.pc.group).toBe("generic");
  });
});
