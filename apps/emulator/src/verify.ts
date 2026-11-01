// An exercise checked on the lab's real devices (medium difficulty), here on
// the server: the lab must be that exercise as it starts (its network's
// fingerprint: the interface is locked, so only the devices' CLI changed it),
// and each goal is a real ping from the device, to the address its target has
// now. The accounts service asks this before it counts a medium solve, so the
// ranking does not take a page's word for it.
import { exerciseById, networkFingerprint, type Check, type Goal, type T, type Topology } from "@visual-tracert/model";
import { docker } from "./docker";
import { execute, startedOf } from "./lab";
import { LABELS } from "./plan";

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

async function checkGoal(lab: string, names: Map<string, string>, check: Check, t: T): Promise<GoalResult> {
  if(check.kind !== "ping" && check.kind !== "isolated") return { ok: false, detail: t("Este objetivo no se comprueba en modo Medio.") };
  const name = (id: string) => names.get(id) ?? id;
  try{
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
  const results = await Promise.all(machine.goals.map(goal => checkGoal(lab, names, goal.check, t)));
  return { ok: results.every(result => result.ok), results, startedAt: startedOf(containers) };
}
