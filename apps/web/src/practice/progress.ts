// The user's progress in practice, in this browser: the exercises solved (and
// when, in each difficulty, and their best time), the difficulty chosen, and
// the attempts: which lab was opened for which exercise and difficulty (its
// challenge card comes back with the lab, and a medium one keeps the
// interface locked), when it started, its deadline and how it ended.
//
// Starting an exercise opens it as a new lab: easy in Simulation, medium
// deployed in Emulation. An exercise's lab is thrown away: starting another
// one stops the containers of every exercise's lab still running; solving it
// closes its own; and when its time is up, unsolved, it is closed too (here,
// and by the emulator itself, which stops a lab past its expiry).
import { exerciseById, solvedKey, TIME_LIMIT, type Difficulty, type Solved } from "@visual-tracert/model";
import { create } from "zustand";
import { useAuth } from "../app/auth";
import { useStore, type Mode } from "../app/store";
import { emulator } from "../emulation/api";
import { useEmulation } from "../emulation/store";
import { t } from "../i18n";
import { practiceApi, useShared, type Solve } from "./server";

const KEY = "visual-tracert.practice";

/** an attempt: the exercise a lab was opened for, in which difficulty, its time and how it ended */
export interface LabExercise {
  exercise: string;
  difficulty: Difficulty;
  /** ms since the epoch (absent in the first versions: no time limit) */
  startedAt?: number;
  deadline?: number;
  /** solved, in this many ms */
  solvedIn?: number;
  /** its time ran out unsolved */
  expired?: boolean;
}

interface Saved {
  /** the account this progress is of (absent: from before accounts) */
  user?: number;
  /** solvedKey → when it was solved */
  done: Solved;
  /** solvedKey → its best time, in ms */
  times: Record<string, number>;
  labs: Record<string, LabExercise>;
  difficulty: Difficulty;
}

function load(): Saved {
  try{
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if(saved && typeof saved.done === "object" && typeof saved.labs === "object"){
      // the first version kept only the exercise's id (easy)
      const labs = Object.fromEntries(Object.entries(saved.labs as Record<string, string | LabExercise>)
        .map(([lab, value]) => [lab, typeof value === "string" ? { exercise: value, difficulty: "easy" as const } : value]));
      return { user: typeof saved.user === "number" ? saved.user : undefined, done: saved.done, times: saved.times ?? {}, labs, difficulty: saved.difficulty === "medium" ? "medium" : "easy" };
    }
  }catch(_){ /* none */ }
  return { done: {}, times: {}, labs: {}, difficulty: "easy" };
}

interface ProgressState extends Saved {
  /** the attempt of a lab solved: its time, the exercise done, its best time */
  markSolved: (lab: string, key: string) => void;
  markExpired: (lab: string) => void;
  link: (lab: string, exercise: LabExercise) => void;
  /** forgets attempts (their labs were thrown away) */
  unlink: (labs: string[]) => void;
  setDifficulty: (difficulty: Difficulty) => void;
  /** the account's progress, from the server */
  adopt: (user: number, solves: Solve[], fresh: boolean) => void;
}

export const useProgress = create<ProgressState>((set, get) => {
  const save = (change: Partial<Saved>) => {
    const next = { user: get().user, done: get().done, times: get().times, labs: get().labs, difficulty: get().difficulty, ...change };
    try{ localStorage.setItem(KEY, JSON.stringify(next)); }catch(_){ /* full or blocked */ }
    set(next);
  };
  return {
    ...load(),
    markSolved: (lab, key) => {
      const attempt = get().labs[lab];
      if(!attempt || attempt.solvedIn !== undefined) return;
      const solvedIn = Date.now() - (attempt.startedAt ?? Date.now());
      const best = get().times[key];
      save({
        labs: { ...get().labs, [lab]: { ...attempt, solvedIn } },
        done: get().done[key] ? get().done : { ...get().done, [key]: Date.now() },
        times: attempt.startedAt && (best === undefined || solvedIn < best) ? { ...get().times, [key]: solvedIn } : get().times,
      });
    },
    markExpired: lab => {
      const attempt = get().labs[lab];
      if(attempt && !attempt.expired && attempt.solvedIn === undefined) save({ labs: { ...get().labs, [lab]: { ...attempt, expired: true } } });
    },
    link: (lab, exercise) => save({ labs: { ...get().labs, [lab]: exercise } }),
    unlink: labs => save({ labs: Object.fromEntries(Object.entries(get().labs).filter(([lab]) => !labs.includes(lab))) }),
    setDifficulty: difficulty => save({ difficulty }),
    adopt: (user, solves, fresh) => {
      const done: Solved = fresh ? {} : { ...get().done };
      const times: Record<string, number> = fresh ? {} : { ...get().times };
      for(const solve of solves){
        const key = solvedKey(solve.exercise, solve.difficulty);
        done[key] = Math.min(done[key] ?? Infinity, solve.solvedAt);
        if(solve.timeMs !== null) times[key] = Math.min(times[key] ?? Infinity, solve.timeMs);
      }
      save({ user, done, times, ...(fresh ? { labs: {} } : {}) });
    },
  };
});

/** "3:42" */
export const clock = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

// the user's own lab open last (not an exercise's): where Simulation and
// Emulation go back to from a challenge
const WORK_KEY = "visual-tracert.work";
let workLab: string | null = null;
try{ workLab = localStorage.getItem(WORK_KEY); }catch(_){ /* none */ }
/** an exercise's lab being opened: not one of the user's own */
let starting = false;

// the open lab's challenge, and its lock: on while it is an exercise in medium difficulty
const syncLock = () => {
  const linked = useProgress.getState().labs[useStore.getState().labId];
  const locked = linked?.difficulty === "medium";
  if(useStore.getState().locked !== locked) useStore.getState().setLocked(locked);
  if(useStore.getState().challenge !== Boolean(linked)) useStore.getState().setChallenge(Boolean(linked));
};
syncLock();
useStore.subscribe((state, previous) => {
  if(state.labId === previous.labId) return;
  syncLock();
  const attempt = useProgress.getState().labs[state.labId];
  if(!attempt && !starting){
    workLab = state.labId;
    try{ localStorage.setItem(WORK_KEY, workLab); }catch(_){ /* full or blocked */ }
  }
  // an exercise's lab opened from the menu: in its own mode
  if(attempt && state.mode !== "practice") resumeMode(attempt);
});

const resumeMode = (attempt: LabExercise) => {
  const mode = attempt.difficulty === "medium" ? "emulation" : "simulation";
  if(useStore.getState().mode !== mode) useStore.getState().setMode(mode);
};

/** opens the user's own lab open last (or another of theirs, or a new one) */
export function openOwnLab(): void {
  const store = useStore.getState();
  const attempts = useProgress.getState().labs;
  const own = store.labs.filter(lab => !attempts[lab.id]);
  const target = own.find(lab => lab.id === workLab) ?? own[0];
  if(target) store.switchLab(target.id);
  else store.createLab("empty");
}

/** a mode from the top bar: an exercise's lab stays in practice, so Simulation
 * and Emulation open the user's own lab instead */
export function chooseMode(mode: Mode): void {
  const store = useStore.getState();
  if(mode !== "practice" && store.challenge && mode !== store.mode) openOwnLab();
  store.setMode(mode);
}

/** back to an exercise's lab in progress, in its mode */
export function resumeExercise(lab: string): void {
  const attempt = useProgress.getState().labs[lab];
  if(!attempt) return;
  useStore.getState().switchLab(lab);
  resumeMode(attempt);
}
useProgress.subscribe(syncLock);

/** stops the containers of a lab, and says so to the page if it is the open one */
async function stopLab(lab: string): Promise<void> {
  await emulator.stop(lab).catch(() => undefined);
  if(lab === useStore.getState().labId) void useEmulation.getState().refresh(lab);
}

/** an attempt solved: its time kept and, from the CLI, its containers closed.
 * Easy: told to the server (a medium one, the server checked and kept already) */
export function finishAttempt(lab: string, key: string, server?: Solve): void {
  const attempt = useProgress.getState().labs[lab];
  useProgress.getState().markSolved(lab, key);
  if(server) useProgress.getState().adopt(useProgress.getState().user ?? 0, [server], false);
  if(attempt?.difficulty === "medium") void stopLab(lab);
  else if(attempt){
    const time = useProgress.getState().labs[lab]?.solvedIn;
    // not sent now (offline): it goes with the next sign-in
    practiceApi.solveEasy(attempt.exercise, time).then(() => useShared.getState().refreshFigures()).catch(() => undefined);
  }
}

// signed in: the account's progress. What this browser solved before accounts
// (or as this account) and the server lacks goes to it; another account's
// progress in this browser is put aside (its solves are on the server)
async function adoptAccount(user: number): Promise<void> {
  const local = useProgress.getState();
  const fresh = local.user !== undefined && local.user !== user;
  try{
    let solves = await practiceApi.solves();
    if(!fresh){
      const have = new Set(solves.map(solve => solvedKey(solve.exercise, solve.difficulty)));
      const missing = Object.entries(local.done).filter(([key]) => !have.has(key)).map(([key, solvedAt]) => {
        const [exercise, difficulty = "easy"] = key.split(":");
        return { exercise, difficulty: difficulty as Difficulty, solvedAt, ...(local.times[key] ? { timeMs: local.times[key] } : {}) };
      });
      if(missing.length) solves = await practiceApi.import(missing);
    }
    useProgress.getState().adopt(user, solves, fresh);
  }catch(_){ /* the server does not answer: this browser's progress, until the next time */ }
}
useAuth.subscribe((state, previous) => { if(state.user && state.user.id !== previous.user?.id) void adoptAccount(state.user.id); });
if(useAuth.getState().user) void adoptAccount(useAuth.getState().user!.id);

// the attempts whose time is up, unsolved: over, their containers closed (the
// emulator closes them too, even with no page open)
setInterval(() => {
  const now = Date.now();
  for(const [lab, attempt] of Object.entries(useProgress.getState().labs)){
    if(attempt.deadline && attempt.deadline <= now && !attempt.expired && attempt.solvedIn === undefined){
      useProgress.getState().markExpired(lab);
      if(attempt.difficulty === "medium") void stopLab(lab);
    }
  }
}, 1000);

/** Throws away the exercises' labs but one: out of the list of labs, and their
 * attempts forgotten (what was solved, and its time, is kept apart). */
export function discardExerciseLabs(keep?: string): void {
  const attempts = Object.keys(useProgress.getState().labs).filter(lab => lab !== keep);
  for(const lab of attempts){
    if(lab !== useStore.getState().labId && useStore.getState().labs.some(item => item.id === lab)) useStore.getState().removeLab(lab);
  }
  useProgress.getState().unlink(attempts);
}

// the labs exercises left behind: only the open one stays, or else the latest
// attempt (its challenge comes back with "Continue")
{
  const attempts = Object.entries(useProgress.getState().labs);
  const open = useStore.getState().labId;
  const latest = attempts.some(([lab]) => lab === open) ? open
    : attempts.sort(([, p], [, q]) => (q.startedAt ?? 0) - (p.startedAt ?? 0))[0]?.[0];
  discardExerciseLabs(latest);
}

/** stops the containers of the exercises' labs still running (but one): they
 * are thrown away, and nobody remembers to stop them */
export async function stopExerciseLabs(except?: string): Promise<void> {
  const ours = useProgress.getState().labs;
  try{
    const running = (await emulator.labs()).filter(item => item.lab !== except && ours[item.lab]);
    await Promise.all(running.map(item => emulator.stop(item.lab).catch(() => undefined)));
  }catch(_){ /* the emulator does not answer: nothing runs there to stop */ }
  void useEmulation.getState().refresh(useStore.getState().labId);
}

/** opens an exercise as a new lab, with its challenge card and its time: easy
 * in Simulation; medium deployed in Emulation (stopped by the emulator when
 * its time is up), its interface locked. The exercises' labs still running
 * are stopped first. */
export async function startExercise(id: string, difficulty: Difficulty = "easy"): Promise<void> {
  const exercise = exerciseById(id);
  if(!exercise) return;
  await stopExerciseLabs();
  const store = useStore.getState();
  starting = true;
  store.startLab(exercise.build(t));
  starting = false;
  const labId = useStore.getState().labId;
  // the labs of the exercises before it: thrown away
  discardExerciseLabs(labId);
  const startedAt = Date.now();
  const deadline = startedAt + TIME_LIMIT[difficulty][exercise.level] * 60_000;
  useProgress.getState().link(labId, { exercise: id, difficulty, startedAt, deadline });
  store.setInspectLab(false);
  if(difficulty === "medium"){
    store.setMode("emulation");
    void useEmulation.getState().deploy(labId, useStore.getState().topology, deadline);
  }else store.setMode("simulation");
}
