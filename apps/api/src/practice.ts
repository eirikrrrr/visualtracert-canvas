// Practice on the server: the exercises each account has solved (when first,
// its best time, and whether the server checked it), and from them the
// ranking, the machines' figures (how many solved each one, who first) and
// each season's own ranking. A medium solve is checked by the emulator on the
// lab's devices before it counts (verified); an easy one is solved in the
// browser's simulation, so it is the page's word (not verified).
// Seasons are an admin's: a set of machines around a theme (BGP, OSPF…), with
// what they are based on, between two dates.
import { exerciseById, EXERCISES, rankOf, solvedKey, xpOf, type Difficulty, type Solved } from "@visual-tracert/model";
import type { DatabaseSync } from "node:sqlite";
import { AccountError, type Role } from "./accounts";
import { Machines } from "./machines";
import { UserData } from "./userdata";

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
  /** its rank's name (Novato…) and level */
  rank: string;
  level: number;
  solves: number;
  verified: number;
  lastSolve: number;
}

export interface MachineFigures {
  solves: number;
  /** who solved it first, and when */
  first?: { username: string; name: string; at: number };
}

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

interface SolveRow { user_id: number; exercise: string; difficulty: Difficulty; solved_at: number; time_ms: number | null; verified: number }
interface SeasonRow { id: number; name: string; theme: string; summary: string; inspiration: string; color: string; icon: string; starts_at: number; ends_at: number; machines: string }

const DIFFICULTIES: Difficulty[] = ["easy", "medium"];
const COLOR = /^#[0-9a-f]{6}$/i;
const ICON = /^[a-z0-9-]{1,24}$/;

const toSolve = (row: SolveRow): Solve => ({
  exercise: row.exercise, difficulty: row.difficulty, solvedAt: row.solved_at, timeMs: row.time_ms, verified: Boolean(row.verified),
});

const toSeason = (row: SeasonRow): Season => ({
  id: row.id, name: row.name, theme: row.theme, summary: row.summary, inspiration: row.inspiration, color: row.color, icon: row.icon,
  startsAt: row.starts_at, endsAt: row.ends_at, machines: JSON.parse(row.machines),
});

/** an exercise and difficulty that exist, and can be played so */
function checkSolve(exercise: unknown, difficulty: unknown): { exercise: string; difficulty: Difficulty } {
  const found = typeof exercise === "string" ? exerciseById(exercise) : undefined;
  if(!found || !DIFFICULTIES.includes(difficulty as Difficulty) || (difficulty === "medium" && !found.cli)) throw new AccountError("bad-request");
  return { exercise: found.id, difficulty: difficulty as Difficulty };
}

const checkTime = (time: unknown) => typeof time === "number" && Number.isFinite(time) && time > 0 && time < 7 * 24 * 3600e3 ? Math.round(time) : null;

export class Practice {
  /** the machines as the admins changed them */
  readonly machines: Machines;
  /** what each account keeps: its labs and its settings */
  readonly data: UserData;

  constructor(private readonly db: DatabaseSync, private readonly now: () => number = Date.now) {
    this.machines = new Machines(db, now);
    this.data = new UserData(db, now);
  }

  solves(userId: number): Solve[] {
    return (this.db.prepare("SELECT * FROM solves WHERE user_id = ? ORDER BY solved_at").all(userId) as unknown as SolveRow[]).map(toSolve);
  }

  /** a solve: the first time stays, the best time and "verified" improve */
  record(userId: number, input: { exercise?: unknown; difficulty?: unknown; timeMs?: unknown; solvedAt?: unknown }, verified: boolean): Solve {
    const { exercise, difficulty } = checkSolve(input.exercise, input.difficulty);
    const time = checkTime(input.timeMs);
    // an import keeps when it was solved; never in the future
    const at = typeof input.solvedAt === "number" && input.solvedAt > 0 && input.solvedAt <= this.now() ? Math.round(input.solvedAt) : this.now();
    this.db.prepare(`INSERT INTO solves (user_id, exercise, difficulty, solved_at, time_ms, verified) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, exercise, difficulty) DO UPDATE SET
        solved_at = MIN(solved_at, excluded.solved_at),
        time_ms = CASE WHEN time_ms IS NULL THEN excluded.time_ms WHEN excluded.time_ms IS NULL THEN time_ms ELSE MIN(time_ms, excluded.time_ms) END,
        verified = MAX(verified, excluded.verified)`).run(userId, exercise, difficulty, at, time, verified ? 1 : 0);
    return toSolve(this.db.prepare("SELECT * FROM solves WHERE user_id = ? AND exercise = ? AND difficulty = ?").get(userId, exercise, difficulty) as unknown as SolveRow);
  }

  /** what a browser had solved before accounts: not verified; the wrong entries left out */
  import(userId: number, list: unknown): Solve[] {
    if(!Array.isArray(list) || list.length > 200) throw new AccountError("bad-request");
    this.db.exec("BEGIN");
    try{
      for(const item of list){
        try{ this.record(userId, item as Record<string, unknown>, false); }
        catch(error){ if(!(error instanceof AccountError)) throw error; }
      }
      this.db.exec("COMMIT");
    }catch(error){
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.solves(userId);
  }

  /** the ranking, by XP (then by who got there first): everyone's, or a season's
   * (its machines, solved between its dates). The enabled accounts only. */
  ranking(seasonId?: number): RankEntry[] {
    const season = seasonId === undefined ? undefined : this.season(seasonId);
    if(seasonId !== undefined && !season) throw new AccountError("not-found", 404);
    const rows = this.db.prepare(`SELECT s.*, u.username, u.name, u.role FROM solves s JOIN users u ON u.id = s.user_id WHERE u.disabled = 0`)
      .all() as unknown as (SolveRow & { username: string; name: string; role: Role })[];
    const users = new Map<number, { row: (typeof rows)[number]; solved: Solved; verified: number; last: number }>();
    for(const row of rows){
      if(season && (!season.machines.includes(row.exercise) || row.solved_at < season.startsAt || row.solved_at > season.endsAt)) continue;
      if(!exerciseById(row.exercise)) continue;
      const entry = users.get(row.user_id) ?? { row, solved: {}, verified: 0, last: 0 };
      entry.solved[solvedKey(row.exercise, row.difficulty)] = row.solved_at;
      entry.verified += row.verified;
      entry.last = Math.max(entry.last, row.solved_at);
      users.set(row.user_id, entry);
    }
    return [...users.entries()]
      .map(([id, entry]) => {
        const rank = rankOf(entry.solved);
        return { id, username: entry.row.username, name: entry.row.name, role: entry.row.role, xp: rank.xp, rank: rank.rank, level: rank.level,
          solves: Object.keys(entry.solved).length, verified: entry.verified, lastSolve: entry.last };
      })
      .sort((p, q) => q.xp - p.xp || p.lastSolve - q.lastSolve)
      .map((entry, i) => ({ position: i + 1, ...entry }));
  }

  /** each machine, in each difficulty: how many solved it, and who first */
  figures(): Record<string, Partial<Record<Difficulty, MachineFigures>>> {
    const counts = this.db.prepare(`SELECT exercise, difficulty, COUNT(*) AS n FROM solves s JOIN users u ON u.id = s.user_id
      WHERE u.disabled = 0 GROUP BY exercise, difficulty`).all() as { exercise: string; difficulty: Difficulty; n: number }[];
    const firsts = this.db.prepare(`SELECT s.exercise, s.difficulty, s.solved_at, u.username, u.name FROM solves s JOIN users u ON u.id = s.user_id
      WHERE u.disabled = 0 AND s.solved_at = (SELECT MIN(solved_at) FROM solves x JOIN users v ON v.id = x.user_id
        WHERE v.disabled = 0 AND x.exercise = s.exercise AND x.difficulty = s.difficulty)`).all() as
      { exercise: string; difficulty: Difficulty; solved_at: number; username: string; name: string }[];
    const out: Record<string, Partial<Record<Difficulty, MachineFigures>>> = {};
    for(const row of counts) (out[row.exercise] ??= {})[row.difficulty] = { solves: row.n };
    for(const row of firsts){
      const entry = out[row.exercise]?.[row.difficulty];
      if(entry && !entry.first) entry.first = { username: row.username, name: row.name, at: row.solved_at };
    }
    return out;
  }

  /** everyone's progress, for a teacher: each account with its XP and what it solved */
  progress(): { id: number; username: string; name: string; role: Role; xp: number; solves: Solve[] }[] {
    const users = this.db.prepare("SELECT id, username, name, role FROM users WHERE disabled = 0 ORDER BY name").all() as { id: number; username: string; name: string; role: Role }[];
    return users.map(user => {
      const solves = this.solves(user.id);
      const xp = solves.reduce((sum, solve) => {
        const exercise = exerciseById(solve.exercise);
        return sum + (exercise ? xpOf(exercise, solve.difficulty) : 0);
      }, 0);
      return { ...user, xp, solves };
    });
  }

  // --- seasons -------------------------------------------------------------------

  seasons(): Season[] {
    return (this.db.prepare("SELECT * FROM seasons ORDER BY starts_at DESC").all() as unknown as SeasonRow[]).map(toSeason);
  }

  season(id: number): Season | undefined {
    const row = this.db.prepare("SELECT * FROM seasons WHERE id = ?").get(id) as SeasonRow | undefined;
    return row && toSeason(row);
  }

  private checkSeason(input: Record<string, unknown>, base?: Season): Omit<Season, "id"> {
    const text = (value: unknown, fallback: string | undefined, max: number, required = false) => {
      const clean = value === undefined ? fallback ?? "" : typeof value === "string" ? value.trim() : null;
      if(clean === null || clean.length > max || (required && !clean)) throw new AccountError("bad-request");
      return clean;
    };
    const time = (value: unknown, fallback: number | undefined) => {
      const at = value === undefined ? fallback : Number(value);
      if(!at || !Number.isFinite(at)) throw new AccountError("bad-request");
      return Math.round(at);
    };
    const machines = input.machines === undefined ? base?.machines ?? [] : input.machines;
    if(!Array.isArray(machines) || machines.length > 50 || !machines.every(id => typeof id === "string" && EXERCISES.some(item => item.id === id))) throw new AccountError("bad-request");
    const color = text(input.color, base?.color ?? "#4f8cff", 7);
    const icon = text(input.icon, base?.icon ?? "router", 24);
    const season = {
      name: text(input.name, base?.name, 60, true), theme: text(input.theme, base?.theme, 30, true),
      summary: text(input.summary, base?.summary, 400), inspiration: text(input.inspiration, base?.inspiration, 1200),
      color, icon, startsAt: time(input.startsAt, base?.startsAt), endsAt: time(input.endsAt, base?.endsAt), machines: [...new Set(machines as string[])],
    };
    if(!COLOR.test(color) || !ICON.test(icon) || season.endsAt <= season.startsAt) throw new AccountError("bad-request");
    return season;
  }

  createSeason(input: Record<string, unknown>): Season {
    const season = this.checkSeason(input);
    const result = this.db.prepare(`INSERT INTO seasons (name, theme, summary, inspiration, color, icon, starts_at, ends_at, machines, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(season.name, season.theme, season.summary, season.inspiration, season.color, season.icon,
      season.startsAt, season.endsAt, JSON.stringify(season.machines), this.now());
    return this.season(Number(result.lastInsertRowid))!;
  }

  updateSeason(id: number, input: Record<string, unknown>): Season {
    const base = this.season(id);
    if(!base) throw new AccountError("not-found", 404);
    const season = this.checkSeason(input, base);
    this.db.prepare(`UPDATE seasons SET name = ?, theme = ?, summary = ?, inspiration = ?, color = ?, icon = ?, starts_at = ?, ends_at = ?, machines = ? WHERE id = ?`)
      .run(season.name, season.theme, season.summary, season.inspiration, season.color, season.icon, season.startsAt, season.endsAt, JSON.stringify(season.machines), id);
    return this.season(id)!;
  }

  deleteSeason(id: number): void {
    this.db.prepare("DELETE FROM seasons WHERE id = ?").run(id);
  }
}
