// What an admin changes of the machines, kept by the accounts service and
// applied here the same way by the service (its ranking counts their points)
// and by the web. Of the app's machines, an edit: their name, story, level,
// points, picture, walkthrough as a PDF, protocols, or hidden. And machines of
// their own, made from a lab: its state as it starts and as it ends solved,
// its goals and hints. Applying them changes EXERCISES in place, so every
// list, check and rank sees them; applying again starts from the app's own.
import { parse, serialize } from "./document";
import { tx } from "./i18n";
import { BOXES, EXERCISES, type BoxId, type Exercise, type ExerciseLevel, type Goal } from "./exercises";
import { PROTOCOLS, type ProtocolId } from "./protocols";
import type { Topology } from "./types";

/** what an admin may change of one of the app's machines */
export interface MachineEdit {
  codename?: string;
  title?: string;
  story?: string;
  summary?: string;
  level?: ExerciseLevel;
  xp?: number;
  image?: string;
  pdf?: string;
  hidden?: boolean;
  protocols?: ProtocolId[];
}

/** a machine an admin made from a lab */
export interface CustomMachine extends Omit<MachineEdit, "level"> {
  box: BoxId;
  level: ExerciseLevel;
  codename: string;
  title: string;
  story: string;
  summary: string;
  icon: string;
  protocols: ProtocolId[];
  goals: Goal[];
  hints: string[];
  /** the CLI's steps: with them it has a medium difficulty */
  cli?: string[];
  /** the lab as it starts, and solved */
  start: Topology;
  solution: Topology;
}

export interface MachineRecord {
  id: string;
  edit?: MachineEdit;
  custom?: CustomMachine;
  updatedAt: number;
}

/** the app's machines as they come, to start from each time */
const BASE: Exercise[] = EXERCISES.map(item => ({ ...item }));
export const isBaseMachine = (id: string) => BASE.some(item => item.id === id);
export const baseMachine = (id: string) => BASE.find(item => item.id === id);

const copy = (topology: Topology): Topology => JSON.parse(JSON.stringify(topology));
const NO_CLI = tx("Esta máquina no tiene pasos de CLI: solo se juega en Fácil.");

function fromCustom(id: string, machine: CustomMachine): Exercise {
  return {
    id, box: machine.box, level: machine.level, title: machine.title, summary: machine.summary, codename: machine.codename,
    story: machine.story, icon: machine.icon, protocols: machine.protocols, goals: machine.goals, hints: machine.hints,
    ...(machine.cli?.length ? { cli: machine.cli } : { cliUnavailable: NO_CLI }),
    xp: machine.xp, image: machine.image, pdf: machine.pdf, hidden: machine.hidden, custom: true,
    build: () => copy(machine.start),
    solve: () => copy(machine.solution),
  };
}

/** applies the admins' changes to EXERCISES (in place), from the app's machines */
export function applyMachines(records: MachineRecord[]): void {
  const byId = new Map(records.map(record => [record.id, record]));
  const next = BASE.map(base => {
    const edit = byId.get(base.id)?.edit;
    return edit ? { ...base, ...Object.fromEntries(Object.entries(edit).filter(([, value]) => value !== undefined)) } : { ...base };
  });
  for(const record of records) if(record.custom && !isBaseMachine(record.id)) next.push(fromCustom(record.id, record.custom));
  EXERCISES.splice(0, EXERCISES.length, ...next);
}

// --- checking what an admin sends ----------------------------------------------

export class MachineError extends Error {}

const text = (value: unknown, max: number, field: string, optional = false): string | undefined => {
  if(value === undefined && optional) return undefined;
  if(typeof value !== "string" || !value.trim() || value.length > max) throw new MachineError(field);
  return value.trim();
};
const asset = (value: unknown, field: string) => {
  if(value === undefined || value === null || value === "") return undefined;
  if(typeof value !== "string" || !/^[a-f0-9]{32}$/.test(value)) throw new MachineError(field);
  return value;
};
const level = (value: unknown): ExerciseLevel => {
  if(value !== 1 && value !== 2 && value !== 3) throw new MachineError("level");
  return value;
};
const protocols = (value: unknown): ProtocolId[] => {
  if(!Array.isArray(value) || value.length > 8 || !value.every(id => PROTOCOLS.some(item => item.id === id))) throw new MachineError("protocols");
  return [...new Set(value as ProtocolId[])];
};
const lines = (value: unknown, field: string, max = 12): string[] => {
  if(!Array.isArray(value) || value.length > max || !value.every(line => typeof line === "string" && line.trim() && line.length <= 400)) throw new MachineError(field);
  return (value as string[]).map(line => line.trim());
};

function edit(data: Record<string, unknown>): MachineEdit {
  const out: MachineEdit = {
    codename: text(data.codename, 60, "codename", true),
    title: text(data.title, 120, "title", true),
    story: text(data.story, 600, "story", true),
    summary: text(data.summary, 600, "summary", true),
    level: data.level === undefined ? undefined : level(data.level),
    xp: data.xp === undefined || data.xp === null ? undefined : Number.isInteger(data.xp) && (data.xp as number) >= 0 && (data.xp as number) <= 1000 ? data.xp as number : (() => { throw new MachineError("xp"); })(),
    image: asset(data.image, "image"),
    pdf: asset(data.pdf, "pdf"),
    hidden: data.hidden === undefined ? undefined : Boolean(data.hidden),
    protocols: data.protocols === undefined ? undefined : protocols(data.protocols),
  };
  return Object.fromEntries(Object.entries(out).filter(([, value]) => value !== undefined)) as MachineEdit;
}

function topology(value: unknown, field: string): Topology {
  // checked as the document it would be saved as
  let parsed: ReturnType<typeof parse>;
  try{ parsed = parse(serialize(value as Topology, "json"), "json"); }catch(_){ throw new MachineError(field); }
  if(!parsed.topology || parsed.problems.length) throw new MachineError(field);
  if(!parsed.topology.devices.length || parsed.topology.devices.length > 40) throw new MachineError(field);
  return parsed.topology;
}

const CHECKS = ["ping", "isolated", "dhcp", "dns", "http", "vlan"];

function goals(value: unknown, start: Topology): Goal[] {
  if(!Array.isArray(value) || !value.length || value.length > 8) throw new MachineError("goals");
  const ids = new Set(start.devices.map(device => device.id));
  return value.map(item => {
    const goal = item as Goal;
    const check = goal?.check as unknown as Record<string, unknown>;
    if(!check || !CHECKS.includes(check.kind as string)) throw new MachineError("goals");
    const device = (check.from ?? check.device) as string;
    if(typeof device !== "string" || !ids.has(device)) throw new MachineError("goals");
    return { text: text(goal.text, 160, "goals")!, check: goal.check };
  });
}

/** an admin's change to a machine, checked: an edit of one of the app's, or one of their own */
export function checkMachine(id: string, data: Record<string, unknown>): Pick<MachineRecord, "edit" | "custom"> {
  if(!/^[a-z0-9][a-z0-9-]{2,39}$/.test(id)) throw new MachineError("id");
  if(isBaseMachine(id)) return { edit: edit(data) };
  const start = topology(data.start, "start");
  const box = data.box as BoxId;
  if(!BOXES.some(item => item.id === box)) throw new MachineError("box");
  const custom: CustomMachine = {
    ...edit(data),
    box, level: level(data.level),
    codename: text(data.codename, 60, "codename")!, title: text(data.title, 120, "title")!,
    story: text(data.story, 600, "story")!, summary: text(data.summary, 600, "summary")!,
    icon: typeof data.icon === "string" && /^[a-z-]{2,20}$/.test(data.icon) ? data.icon : "router",
    protocols: protocols(data.protocols ?? []),
    goals: goals(data.goals, start),
    hints: lines(data.hints ?? [], "hints"),
    cli: data.cli === undefined ? undefined : lines(data.cli, "cli"),
    start, solution: topology(data.solution, "solution"),
  };
  if(!custom.cli?.length) delete custom.cli;
  return { custom };
}
