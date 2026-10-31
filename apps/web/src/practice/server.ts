// Practice on the server (the accounts service, /auth): the solves of the
// account, the ranking, the machines' figures, everyone's progress (teachers)
// and the seasons. A medium solve is sent with its lab: the server has the
// emulator check it on the devices before it counts.
import type { Difficulty } from "@visual-tracert/model";
import { create } from "zustand";
import { authCall, type Role } from "../app/auth";

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
};

/** what the server says of everyone, kept while the app runs: refreshed when asked */
interface Shared {
  figures: Figures;
  seasons: Season[] | null;
  refreshFigures: () => Promise<void>;
  refreshSeasons: () => Promise<void>;
}

export const useShared = create<Shared>(set => ({
  figures: {},
  seasons: null,
  refreshFigures: async () => { try{ set({ figures: await practiceApi.figures() }); }catch(_){ /* the figures wait */ } },
  refreshSeasons: async () => { try{ set({ seasons: await practiceApi.seasons() }); }catch(_){ set({ seasons: [] }); } },
}));
