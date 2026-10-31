// Whether a goal of an exercise is met, asked to the lab itself. Easy: the
// simulation runs the ping, the DHCP request, the name lookup or the web page
// it asks for, or the lab says what it has (a port's VLAN). Medium: the real
// devices of the emulation run the ping, with the addresses they have now.
// So any correct way of solving the exercise passes, not one answer.
import type { Check, Goal, Topology } from "@visual-tracert/model";
import type { T } from "../i18n";
import { emulator } from "../emulation/api";
import { simulate } from "../sim/engine";

export interface GoalResult {
  ok: boolean;
  /** what happened, said to the user */
  detail: string;
}

const deviceOf = (topology: Topology, id: string) => topology.devices.find(item => item.id === id);

/** a target: a device's first address, or an address or a name as written */
function targetOf(topology: Topology, to: string): string | null {
  const device = deviceOf(topology, to);
  if(!device) return to;
  return device.interfaces.find(iface => iface.ip)?.ip ?? null;
}

export function checkGoal(topology: Topology, check: Check, t: T): GoalResult {
  const from = "from" in check ? deviceOf(topology, check.from) : undefined;
  if("from" in check && !from) return { ok: false, detail: t("No existe el equipo «{id}».", { id: check.from }) };
  switch(check.kind){
    case "ping":
    case "isolated": {
      const to = targetOf(topology, check.to);
      if(!to) return { ok: false, detail: t("{device} no tiene dirección.", { device: deviceOf(topology, check.to)?.name ?? check.to }) };
      const run = simulate(topology, { kind: "ping", from: check.from, to }, t);
      if(check.kind === "ping") return { ok: run.outcome.ok, detail: run.outcome.message };
      return run.outcome.ok
        ? { ok: false, detail: t("Todavía llega: {message}", { message: run.outcome.message }) }
        : { ok: true, detail: t("No llega, como debe.") };
    }
    case "dhcp": {
      const run = simulate(topology, { kind: "dhcp", from: check.from }, t);
      return { ok: run.outcome.ok && Boolean(run.lease), detail: run.outcome.message };
    }
    case "dns": {
      const run = simulate(topology, { kind: "dns", from: check.from, to: check.name }, t);
      if(!run.outcome.ok) return { ok: false, detail: run.outcome.message };
      const right = run.outcome.message.includes(check.ip);
      return { ok: right, detail: right ? run.outcome.message : t("Se resuelve, pero no a {ip}: {message}", { ip: check.ip, message: run.outcome.message }) };
    }
    case "http": {
      const run = simulate(topology, { kind: "http", from: check.from, to: check.to }, t);
      return { ok: run.outcome.ok, detail: run.outcome.message };
    }
    case "vlan": {
      const device = deviceOf(topology, check.device);
      const iface = device?.interfaces.find(item => item.name === check.iface);
      if(!device || !iface) return { ok: false, detail: t("No existe el puerto {iface} de «{id}».", { iface: check.iface, id: check.device }) };
      const vlan = iface.vlan ?? 1;
      return { ok: vlan === check.vlan, detail: t("{iface} está en la VLAN {vlan}.", { iface: check.iface, vlan }) };
    }
  }
}

export const checkGoals = (topology: Topology, goals: Goal[], t: T) => goals.map(goal => checkGoal(topology, goal.check, t));

// --- medium difficulty: on the real devices of the emulation ----------------

/** the addresses a running device has now (set from its CLI, not the document's) */
async function liveAddresses(lab: string, device: string): Promise<string[]> {
  const { output } = await emulator.run(lab, device, "addresses");
  return [...output.matchAll(/inet (\d+\.\d+\.\d+\.\d+)\/\d+/g)].map(match => match[1]).filter(ip => !ip.startsWith("127."));
}

/** the last lines of a ping: how many went and came back */
const summary = (output: string) => output.trim().split("\n").filter(line => /packets|received|loss|unreachable/i.test(line)).slice(-1)[0] ?? output.trim().split("\n").slice(-1)[0] ?? "";

/** A goal checked on the lab's real devices: a real ping from the device's CLI. */
export async function checkGoalLive(lab: string, topology: Topology, check: Check, t: T): Promise<GoalResult> {
  if(check.kind !== "ping" && check.kind !== "isolated") return { ok: false, detail: t("Este objetivo no se comprueba en modo Medio.") };
  try{
    const device = deviceOf(topology, check.to);
    const to = device ? (await liveAddresses(lab, check.to))[0] : check.to;
    if(!to) return { ok: false, detail: t("{device} no tiene dirección.", { device: device?.name ?? check.to }) };
    // its own address would answer by itself: two devices with the same address
    if((await liveAddresses(lab, check.from)).includes(to)){
      return { ok: false, detail: t("{from} y {to} tienen la misma dirección ({ip}): hay un conflicto de IP.", { from: deviceOf(topology, check.from)?.name ?? check.from, to: device?.name ?? to, ip: to }) };
    }
    const run = await emulator.run(lab, check.from, "ping", to);
    const reached = run.exitCode === 0;
    const line = summary(run.output);
    if(check.kind === "ping") return { ok: reached, detail: `${run.command}: ${line}` };
    return reached ? { ok: false, detail: t("Todavía llega: {message}", { message: line }) } : { ok: true, detail: t("No llega, como debe.") };
  }catch(error){
    return { ok: false, detail: (error as Error).message };
  }
}

export const checkGoalsLive = (lab: string, topology: Topology, goals: Goal[], t: T) =>
  Promise.all(goals.map(goal => checkGoalLive(lab, topology, goal.check, t)));
