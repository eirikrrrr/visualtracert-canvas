// Traffic captures: tcpdump run from the emulator inside a device's network
// namespace (nothing is installed on the device), writing pcap to its
// output, which the page reads and decodes. A port is named as the topology
// names it (Gi0/0): its Linux name is found by the alias the deployment gave
// it.
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { spanish, type T } from "@visual-tracert/model";
import { docker } from "./docker";
import { LABELS } from "./plan";

const run = promisify(execFile);

/** what a capture filter may have: tcpdump's words, addresses, ports and operators */
const FILTER = /^[A-Za-z0-9 .:/()!&|<>=\-[\]]{0,200}$/;
/** a capture stops by itself past this many bytes */
export const CAPTURE_LIMIT = 64 * 1024 * 1024;

export class CaptureError extends Error {}

/** the Linux name of a device's port: by its alias (Gi0/0), or its own name */
async function ifnameOf(pid: number, iface: string): Promise<string | null> {
  if(iface === "any") return "any";
  const { stdout } = await run("nsenter", ["-t", String(pid), "-n", "ip", "-o", "link", "show"], { timeout: 10_000 });
  for(const line of stdout.split("\n")){
    const name = line.match(/^\d+:\s+([^:@\s]+)/)?.[1];
    const alias = line.match(/\\\s+alias\s+(.+?)\s*$/)?.[1];
    if(name && (name === iface || alias === iface)) return name;
  }
  return null;
}

export async function startCapture(lab: string, device: string, iface: string, filter: string, t: T = spanish): Promise<ChildProcessWithoutNullStreams> {
  if(!FILTER.test(filter)) throw new CaptureError(t("El filtro solo admite palabras de tcpdump, direcciones, puertos y operadores (and, or, not, paréntesis)."));
  const container = (await docker.list({ [LABELS.lab]: lab, [LABELS.device]: device }))[0];
  if(!container || container.State !== "running") throw new CaptureError(t("{device} no está en marcha.", { device }));
  const pid = await docker.pid(container.Id);
  const name = await ifnameOf(pid, iface);
  if(!name) throw new CaptureError(t("{device} no tiene la interfaz «{iface}» (¿tiene cable?).", { device, iface }));
  // -U: each packet written as it comes; -s: whole packets; -n: no names
  const args = ["-t", String(pid), "-n", "tcpdump", "-i", name, "-U", "-n", "-s", "262144", "-w", "-"];
  if(filter.trim()) args.push(filter.trim());
  return spawn("nsenter", args, { stdio: ["pipe", "pipe", "pipe"] });
}
