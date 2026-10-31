// Whether a goal of an exercise is met, asked to the lab itself. Easy: the
// simulation runs the ping, the DHCP request, the name lookup or the web page
// it asks for, or the lab says what it has (a port's VLAN). Medium is checked
// by the server, on the emulation's real devices (apps/emulator/src/verify.ts).
// So any correct way of solving the exercise passes, not one answer.
import type { Check, Goal, Topology } from "@visual-tracert/model";
import type { T } from "../i18n";
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
