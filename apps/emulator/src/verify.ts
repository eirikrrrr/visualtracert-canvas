// An exercise checked on the lab's real devices (medium difficulty), here on
// the server: the lab must be that exercise as it starts (its network's
// fingerprint: the interface is locked, so only the devices' CLI changed it),
// and each goal is a real ping from the device, to the address its target has
// now. The accounts service asks this before it counts a medium solve, so the
// ranking does not take a page's word for it.
import { exerciseById, networkFingerprint, type Check, type Goal, type T, type Topology } from "@visual-tracert/model";
import { docker } from "./docker";
import { execute, probe, startedOf } from "./lab";
import { ifnameOf, LABELS } from "./plan";

export interface GoalResult {
  ok: boolean;
  /** what happened, said to the user */
  detail: string;
}

export interface Verdict {
  /** every goal met */
  ok: boolean;
  results: GoalResult[];
  /** when the lab was deployed, in ms since the epoch: the time it took is measured from here */
  startedAt: number;
}

export class VerifyError extends Error {}

/** a machine an admin made, which this server does not have: how it starts and
 * its goals (the accounts service sends it; a definition sent by anyone else
 * only fools its sender, since only the service records solves) */
export interface Definition {
  start: Topology;
  goals: Goal[];
}

/** the IPv4 addresses a running device has now (set from its CLI, not the document's) */
async function addressesOf(lab: string, device: string, t: T): Promise<string[]> {
  const { output } = await execute(lab, device, "addresses", undefined, t);
  return [...output.matchAll(/inet (\d+\.\d+\.\d+\.\d+)\/\d+/g)].map(match => match[1]).filter(ip => !ip.startsWith("127."));
}

/** the last lines of a ping: how many went and came back */
const summary = (output: string) => output.trim().split("\n").filter(line => /packets|received|loss|unreachable/i.test(line)).slice(-1)[0] ?? output.trim().split("\n").slice(-1)[0] ?? "";

/** a name resolved on a device, with the resolver it has now */
async function resolve(lab: string, device: string, name: string, t: T): Promise<string[]> {
  const { output } = await probe(lab, device, ["nslookup", "-timeout=2", "-retry=1", name], t);
  // the server's own address comes first ("Address: 172.20.0.53#53"): those with a port are not the answer
  return [...output.matchAll(/Address:\s*(\d+\.\d+\.\d+\.\d+)(?!#)\s*$/gm)].map(match => match[1]);
}

/** a switch port's access VLAN now (its PVID), as its bridge says */
async function vlanOf(lab: string, device: string, ifname: string, t: T): Promise<number | null> {
  const { output } = await probe(lab, device, ["bridge", "-j", "vlan", "show", "dev", ifname], t);
  try{
    const ports = JSON.parse(output) as { ifname: string; vlans?: { vlan: number; flags?: string[] }[] }[];
    return ports.find(port => port.ifname === ifname)?.vlans?.find(vlan => vlan.flags?.includes("PVID"))?.vlan ?? null;
  }catch(_){ return null; }
}

async function checkGoal(lab: string, names: Map<string, string>, ports: Map<string, Map<string, string>>, check: Check, t: T): Promise<GoalResult> {
  const name = (id: string) => names.get(id) ?? id;
  try{
    if(check.kind === "dhcp"){
      const got = (await addressesOf(lab, check.from, t)).filter(ip => !ip.startsWith("169.254."));
      return got.length ? { ok: true, detail: t("{device} recibió {ip} por DHCP.", { device: name(check.from), ip: got[0] }) }
        : { ok: false, detail: t("{device} aún no tiene dirección: ningún servidor DHCP le ha respondido.", { device: name(check.from) }) };
    }
    if(check.kind === "dns"){
      const got = await resolve(lab, check.from, check.name, t);
      if(got.includes(check.ip)) return { ok: true, detail: t("{device} resuelve {name} a {ip}.", { device: name(check.from), name: check.name, ip: check.ip }) };
      return { ok: false, detail: got.length ? t("{device} resuelve {name} a {got}, no a {ip}.", { device: name(check.from), name: check.name, got: got.join(", "), ip: check.ip })
        : t("{device} no resuelve {name}: revisa su servidor DNS y el registro.", { device: name(check.from), name: check.name }) };
    }
    if(check.kind === "http"){
      const target = names.has(check.to) ? (await addressesOf(lab, check.to, t))[0] : check.to;
      const run = await probe(lab, check.from, ["wget", "-q", "-O", "/dev/null", "-T", "4", `http://${target}/`], t);
      return run.exitCode === 0 ? { ok: true, detail: t("{device} abre http://{to}.", { device: name(check.from), to: check.to }) }
        : { ok: false, detail: t("{device} no abre http://{to}: {message}", { device: name(check.from), to: check.to, message: run.output.trim().split("\n").slice(-1)[0] || t("sin respuesta") }) };
    }
    if(check.kind === "vlan"){
      const ifname = ports.get(check.device)?.get(check.iface);
      if(!ifname) return { ok: false, detail: t("{device} no tiene el puerto {iface}.", { device: name(check.device), iface: check.iface }) };
      const vlan = await vlanOf(lab, check.device, ifname, t);
      return vlan === check.vlan ? { ok: true, detail: t("{iface} está en la VLAN {vlan}.", { iface: check.iface, vlan: check.vlan }) }
        : { ok: false, detail: t("{iface} está en la VLAN {vlan}, no en la {want}.", { iface: check.iface, vlan: vlan ?? "—", want: check.vlan }) };
    }
    const device = names.has(check.to);
    const to = device ? (await addressesOf(lab, check.to, t))[0] : check.to;
    if(!to) return { ok: false, detail: t("{device} no tiene dirección.", { device: name(check.to) }) };
    // its own address would answer by itself: two devices with the same address
    if((await addressesOf(lab, check.from, t)).includes(to)){
      return { ok: false, detail: t("{from} y {to} tienen la misma dirección ({ip}): hay un conflicto de IP.", { from: name(check.from), to: device ? name(check.to) : to, ip: to }) };
    }
    const run = await execute(lab, check.from, "ping", to, t);
    const reached = run.exitCode === 0;
    const line = summary(run.output);
    if(check.kind === "ping") return { ok: reached, detail: `${run.command}: ${line}` };
    return reached ? { ok: false, detail: t("Todavía llega: {message}", { message: line }) } : { ok: true, detail: t("No llega, como debe.") };
  }catch(error){
    return { ok: false, detail: (error as Error).message };
  }
}

/** checks a lab deployed for an exercise in medium difficulty, on its devices */
export async function verifyExercise(lab: string, id: string, t: T, definition?: Definition): Promise<Verdict> {
  const exercise = exerciseById(id);
  if(exercise && !exercise.cli) throw new VerifyError(t("Ese reto no tiene modo Medio."));
  const machine = exercise ? { start: exercise.build(t), goals: exercise.goals } : definition;
  if(!machine?.start?.devices || !Array.isArray(machine.goals)) throw new VerifyError(t("Ese reto no tiene modo Medio."));
  const containers = await docker.list({ [LABELS.lab]: lab });
  if(!containers.length) throw new VerifyError(t("El laboratorio no está desplegado."));
  const { start } = machine;
  if(containers[0].Labels[LABELS.fingerprint] !== networkFingerprint(start)) throw new VerifyError(t("Este laboratorio no es el del reto tal como empieza: inícialo de nuevo desde Practicar."));
  const names = new Map(start.devices.map(device => [device.id, device.name]));
  // each port's Linux name, as the plan gives it (Fa0/3 → Fa0-3)
  const ports = new Map(start.devices.map(device => {
    const taken = new Set<string>();
    return [device.id, new Map(device.interfaces.map(iface => [iface.name, ifnameOf(iface.name, taken)]))];
  }));
  const results = await Promise.all(machine.goals.map(goal => checkGoal(lab, names, ports, goal.check, t)));
  return { ok: results.every(result => result.ok), results, startedAt: startedOf(containers) };
}
