// Practice on the server (the accounts service, /auth): the solves of the
// account, the ranking, the machines' figures, everyone's progress (teachers)
// and the seasons. A medium solve is sent with its lab: the server has the
// emulator check it on the devices before it counts.
import { applyMachines, type Difficulty, type MachineRecord } from "@visual-tracert/model";
import { create } from "zustand";
import { authCall, AuthError, useAuth, type Role } from "../app/auth";

export interface Solve {
  exercise: string;
  difficulty: Difficulty;
  solvedAt: number;
  timeMs: number | null;
  verified: boolean;
}

export interface RankEntry {
  position: number;
  id: number;
  username: string;
  name: string;
  role: Role;
  xp: number;
  rank: string;
  level: number;
  solves: number;
  verified: number;
  lastSolve: number;
}

export interface Ranking {
  entries: RankEntry[];
  me: RankEntry | null;
  total: number;
}

export interface MachineFigures {
  solves: number;
  first?: { username: string; name: string; at: number };
}

export type Figures = Record<string, Partial<Record<Difficulty, MachineFigures>>>;

export interface Season {
  id: number;
  name: string;
  theme: string;
  summary: string;
  inspiration: string;
  color: string;
  icon: string;
  startsAt: number;
  endsAt: number;
  machines: string[];
}

export type SeasonInput = Omit<Season, "id">;

export interface StudentProgress {
  id: number;
  username: string;
  name: string;
  role: Role;
  xp: number;
  solves: Solve[];
}

/** a medium solve, as the server checked it on the devices */
export interface ServerCheck {
  ok: boolean;
  results?: { ok: boolean; detail: string }[];
  solve?: Solve;
}

export const practiceApi = {
  solves: () => authCall<Solve[]>("GET", "/solves"),
  solveEasy: (exercise: string, timeMs?: number) => authCall<ServerCheck>("POST", "/solves", { exercise, difficulty: "easy", timeMs }),
  checkMedium: (exercise: string, lab: string) => authCall<ServerCheck>("POST", "/solves", { exercise, difficulty: "medium", lab }),
  import: (solves: { exercise: string; difficulty: Difficulty; solvedAt: number; timeMs?: number }[]) => authCall<Solve[]>("POST", "/solves/import", { solves }),
  ranking: (season?: number) => authCall<Ranking>("GET", season ? `/rankings?season=${season}` : "/rankings"),
  figures: () => authCall<Figures>("GET", "/figures"),
  progress: () => authCall<StudentProgress[]>("GET", "/progress"),
  seasons: () => authCall<Season[]>("GET", "/seasons"),
  createSeason: (season: SeasonInput) => authCall<Season>("POST", "/seasons", season),
  updateSeason: (id: number, season: Partial<SeasonInput>) => authCall<Season>("PATCH", `/seasons/${id}`, season),
  deleteSeason: (id: number) => authCall<void>("DELETE", `/seasons/${id}`),
  machines: () => authCall<MachineRecord[]>("GET", "/machines"),
  putMachine: (id: string, machine: Record<string, unknown>) => authCall<MachineRecord>("PUT", `/machines/${id}`, machine),
  deleteMachine: (id: string) => authCall<void>("DELETE", `/machines/${id}`),
  /** a picture or a PDF, as it is: its id */
  upload: async (file: File): Promise<string> => {
    let res: Response;
    try{ res = await fetch("/auth/files", { method: "POST", credentials: "same-origin", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file }); }
    catch(_){ throw new AuthError("emulator-unavailable"); }
    const data = await res.json().catch(() => null) as { id?: string; error?: string } | null;
    if(!res.ok || !data?.id) throw new AuthError(data?.error ?? (res.status === 413 ? "too-large" : String(res.status)));
    return data.id;
  },
};

/** a file of the accounts service (a machine's picture, its PDF) */
export const fileUrl = (id: string) => `/auth/files/${id}`;

/** what the server says of everyone, kept while the app runs: refreshed when asked */
interface Shared {
  figures: Figures;
  seasons: Season[] | null;
  refreshFigures: () => Promise<void>;
  refreshSeasons: () => Promise<void>;
  /** what the admins changed of the machines (applied to the model's) */
  machines: MachineRecord[];
  /** grows each time they are applied: what lists machines draws again */
  machinesVersion: number;
  refreshMachines: () => Promise<void>;
}

export const useShared = create<Shared>(set => ({
  figures: {},
  seasons: null,
  refreshFigures: async () => { try{ set({ figures: await practiceApi.figures() }); }catch(_){ /* the figures wait */ } },
  refreshSeasons: async () => { try{ set({ seasons: await practiceApi.seasons() }); }catch(_){ set({ seasons: [] }); } },
  machines: [],
  machinesVersion: 0,
  refreshMachines: async () => {
    try{
      const machines = await practiceApi.machines();
      applyMachines(machines);
      set(state => ({ machines, machinesVersion: state.machinesVersion + 1 }));
    }catch(_){ /* the app's own, meanwhile */ }
  },
}));

// the admins' machines, as soon as there is a session
useAuth.subscribe((state, previous) => { if(state.user && state.user.id !== previous.user?.id) void useShared.getState().refreshMachines(); });
if(useAuth.getState().user) void useShared.getState().refreshMachines();
