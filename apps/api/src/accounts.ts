// Accounts: users with a role (student, teacher, admin), their sessions and
// the invitations that let someone create one. The first account, made when
// there is none, is an admin; every other one needs an invitation code, which
// sets its role. Errors are codes (AccountError): the web words them in the
// user's language.
import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./passwords";

export type Role = "student" | "teacher" | "admin";
export const ROLES: readonly Role[] = ["student", "teacher", "admin"];

/** a user as the API shows it (never its password) */
export interface User {
  id: number;
  username: string;
  name: string;
  role: Role;
  disabled: boolean;
  mustChange: boolean;
  createdAt: number;
  lastLogin: number | null;
}

export interface Invite {
  code: string;
  role: Role;
  usesLeft: number;
  expiresAt: number | null;
  note: string | null;
  createdBy: string | null;
  createdAt: number;
}

export type ErrorCode =
  | "bad-request" | "bad-username" | "bad-name" | "bad-password" | "username-taken"
  | "already-set-up" | "invalid-setup-code" | "invalid-invite" | "invalid-credentials" | "disabled" | "too-many-attempts"
  | "wrong-password" | "not-found" | "last-admin" | "unauthorized" | "forbidden" | "emulator-unavailable" | "not-verified"
  | "bad-machine" | "bad-file" | "too-large" | "bad-lab" | "too-many-labs";

export class AccountError extends Error {
  /** what was wrong: the field of a machine, say */
  constructor(readonly code: ErrorCode, readonly status = 400, readonly detail?: string) {
    super(code);
  }
}

export const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/i;
export const PASSWORD_MIN = 10;
const PASSWORD_MAX = 200;
const NAME_MAX = 60;
const DAY = 24 * 60 * 60 * 1000;
/** a session lasts 30 days from its last use (renewed once a day at most) */
export const SESSION_TTL = 30 * DAY;

interface UserRow {
  id: number; username: string; name: string; role: Role; password: string;
  disabled: number; must_change: number; created_at: number; last_login: number | null;
}

const toUser = (row: UserRow): User => ({
  id: row.id, username: row.username, name: row.name, role: row.role,
  disabled: Boolean(row.disabled), mustChange: Boolean(row.must_change), createdAt: row.created_at, lastLogin: row.last_login,
});

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

function checkUsername(username: unknown): string {
  if(typeof username !== "string" || !USERNAME.test(username)) throw new AccountError("bad-username");
  return username.toLowerCase();
}

function checkName(name: unknown): string {
  const clean = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if(!clean || clean.length > NAME_MAX) throw new AccountError("bad-name");
  return clean;
}

function checkPassword(password: unknown): string {
  if(typeof password !== "string" || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) throw new AccountError("bad-password");
  return password;
}

function checkRole(role: unknown): Role {
  if(!ROLES.includes(role as Role)) throw new AccountError("bad-request");
  return role as Role;
}

/** "K7QF-9XRM-2PDA": easy to read aloud and type (no 0/O, 1/I) */
function inviteCode(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(12);
  const letters = [...bytes].map(byte => alphabet[byte % alphabet.length]).join("");
  return `${letters.slice(0, 4)}-${letters.slice(4, 8)}-${letters.slice(8, 12)}`;
}

export class Accounts {
  constructor(private readonly db: DatabaseSync, private readonly now: () => number = Date.now) {}

  /** no account yet: the first one to be made is the admin */
  needsSetup(): boolean {
    return !this.db.prepare("SELECT 1 FROM users LIMIT 1").get();
  }

  private insertUser(username: string, name: string, role: Role, password: string, mustChange = false): User {
    if(this.db.prepare("SELECT 1 FROM users WHERE username = ?").get(username)) throw new AccountError("username-taken", 409);
    const result = this.db.prepare("INSERT INTO users (username, name, role, password, must_change, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(username, name, role, password, mustChange ? 1 : 0, this.now());
    return this.user(Number(result.lastInsertRowid))!;
  }

  /** the first account, an admin: only while there is none */
  async setup(input: { username?: unknown; name?: unknown; password?: unknown }): Promise<User> {
    const username = checkUsername(input.username), name = checkName(input.name), password = checkPassword(input.password);
    if(!this.needsSetup()) throw new AccountError("already-set-up", 409);
    return this.insertUser(username, name, "admin", await hashPassword(password));
  }

  /** an account from an invitation: its role is the invitation's, and it is one use less */
  async register(input: { invite?: unknown; username?: unknown; name?: unknown; password?: unknown }): Promise<User> {
    const username = checkUsername(input.username), name = checkName(input.name), password = checkPassword(input.password);
    const invite = typeof input.invite === "string" ? this.usableInvite(input.invite) : null;
    if(!invite) throw new AccountError("invalid-invite");
    const hash = await hashPassword(password);
    this.db.exec("BEGIN IMMEDIATE");
    try{
      // checked again inside the transaction: another sign-up may have used it up
      if(!this.usableInvite(invite.code)) throw new AccountError("invalid-invite");
      const user = this.insertUser(username, name, invite.role, hash);
      this.db.prepare("UPDATE invites SET uses_left = uses_left - 1 WHERE code = ?").run(invite.code);
      this.db.exec("COMMIT");
      return user;
    }catch(error){
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /** the user, if the password is theirs and the account is enabled */
  async authenticate(username: unknown, password: unknown): Promise<User> {
    const row = typeof username === "string" ? this.db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined : undefined;
    // as long whether the user exists or not
    const ok = await verifyPassword(typeof password === "string" ? password : "", row?.password ?? DUMMY_HASH);
    if(!row || !ok) throw new AccountError("invalid-credentials", 401);
    if(row.disabled) throw new AccountError("disabled", 403);
    this.db.prepare("UPDATE users SET last_login = ? WHERE id = ?").run(this.now(), row.id);
    return toUser({ ...row, last_login: this.now() });
  }

  user(id: number): User | undefined {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
    return row && toUser(row);
  }

  users(): User[] {
    return (this.db.prepare("SELECT * FROM users ORDER BY created_at").all() as unknown as UserRow[]).map(toUser);
  }

  // --- sessions ---------------------------------------------------------------

  /** a new session: its token (for the cookie; only its hash is kept) */
  createSession(userId: number, userAgent?: string): string {
    const token = randomBytes(32).toString("base64url");
    const now = this.now();
    this.db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen, user_agent) VALUES (?, ?, ?, ?, ?, ?)")
      .run(sha256(token), userId, now, now + SESSION_TTL, now, userAgent?.slice(0, 200) ?? null);
    return token;
  }

  /** the user of a session, if it is valid and the account enabled; renews it once a day */
  session(token: string | undefined): User | undefined {
    if(!token) return undefined;
    const now = this.now();
    const hash = sha256(token);
    const row = this.db.prepare("SELECT s.last_seen, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?")
      .get(hash) as (UserRow & { last_seen: number; expires_at: number }) | undefined;
    if(!row) return undefined;
    if(row.expires_at <= now){ this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash); return undefined; }
    if(row.disabled) return undefined;
    if(now - row.last_seen > DAY) this.db.prepare("UPDATE sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?").run(now, now + SESSION_TTL, hash);
    return toUser(row);
  }

  endSession(token: string | undefined): void {
    if(token) this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  }

  /** every session of the user but one (the one in use) */
  endSessions(userId: number, keep?: string): void {
    this.db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(userId, keep ? sha256(keep) : "");
  }

  pruneSessions(): void {
    this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(this.now());
  }

  // --- the user's own account ---------------------------------------------------

  async changePassword(userId: number, current: unknown, next: unknown, keep?: string): Promise<User> {
    const password = checkPassword(next);
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined;
    if(!row) throw new AccountError("not-found", 404);
    if(!await verifyPassword(typeof current === "string" ? current : "", row.password)) throw new AccountError("wrong-password", 403);
    this.db.prepare("UPDATE users SET password = ?, must_change = 0 WHERE id = ?").run(await hashPassword(password), userId);
    // the other browsers signed in with the old password: out
    this.endSessions(userId, keep);
    return this.user(userId)!;
  }

  rename(userId: number, name: unknown): User {
    this.db.prepare("UPDATE users SET name = ? WHERE id = ?").run(checkName(name), userId);
    const user = this.user(userId);
    if(!user) throw new AccountError("not-found", 404);
    return user;
  }

  // --- administration -----------------------------------------------------------

  private admins(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0").get() as { n: number }).n;
  }

  /** an admin changes a user's role or disables them; the last enabled admin stays one */
  updateUser(id: number, change: { role?: unknown; disabled?: unknown; name?: unknown }): User {
    const user = this.user(id);
    if(!user) throw new AccountError("not-found", 404);
    const role = change.role === undefined ? user.role : checkRole(change.role);
    const disabled = change.disabled === undefined ? user.disabled : Boolean(change.disabled);
    const name = change.name === undefined ? user.name : checkName(change.name);
    if(user.role === "admin" && !user.disabled && (role !== "admin" || disabled) && this.admins() <= 1) throw new AccountError("last-admin", 409);
    this.db.prepare("UPDATE users SET role = ?, disabled = ?, name = ? WHERE id = ?").run(role, disabled ? 1 : 0, name, id);
    if(disabled) this.endSessions(id);
    return this.user(id)!;
  }

  /** an admin sets a new password for a user, who must change it when they sign in */
  async resetPassword(id: number, password: unknown): Promise<User> {
    const next = checkPassword(password);
    if(!this.user(id)) throw new AccountError("not-found", 404);
    this.db.prepare("UPDATE users SET password = ?, must_change = 1 WHERE id = ?").run(await hashPassword(next), id);
    this.endSessions(id);
    return this.user(id)!;
  }

  deleteUser(id: number): void {
    const user = this.user(id);
    if(!user) throw new AccountError("not-found", 404);
    if(user.role === "admin" && !user.disabled && this.admins() <= 1) throw new AccountError("last-admin", 409);
    this.db.prepare("DELETE FROM users WHERE id = ?").run(id);
  }

  // --- invitations --------------------------------------------------------------

  createInvite(by: number, input: { role?: unknown; uses?: unknown; days?: unknown; note?: unknown }): Invite {
    const role = input.role === undefined ? "student" : checkRole(input.role);
    const uses = input.uses === undefined ? 1 : Number(input.uses);
    const days = input.days === undefined || input.days === null ? 7 : Number(input.days);
    if(!Number.isInteger(uses) || uses < 1 || uses > 500) throw new AccountError("bad-request");
    if(!Number.isFinite(days) || days < 0 || days > 365) throw new AccountError("bad-request");
    const note = typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 80) : null;
    const code = inviteCode();
    const now = this.now();
    this.db.prepare("INSERT INTO invites (code, role, uses_left, expires_at, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(code, role, uses, days ? now + days * DAY : null, note, by, now);
    return this.invites().find(invite => invite.code === code)!;
  }

  /** the invitations that can still be used */
  invites(): Invite[] {
    const rows = this.db.prepare(`SELECT i.*, u.username AS creator FROM invites i LEFT JOIN users u ON u.id = i.created_by
      WHERE i.uses_left > 0 AND (i.expires_at IS NULL OR i.expires_at > ?) ORDER BY i.created_at DESC`).all(this.now()) as unknown as
      { code: string; role: Role; uses_left: number; expires_at: number | null; note: string | null; creator: string | null; created_at: number }[];
    return rows.map(row => ({ code: row.code, role: row.role, usesLeft: row.uses_left, expiresAt: row.expires_at, note: row.note, createdBy: row.creator, createdAt: row.created_at }));
  }

  /** an invitation, if it can still be used (the code as typed: any case, spaces) */
  usableInvite(code: string): Invite | undefined {
    const clean = code.trim().toUpperCase().replace(/\s+/g, "");
    return this.invites().find(invite => invite.code === clean);
  }

  deleteInvite(code: string): void {
    this.db.prepare("DELETE FROM invites WHERE code = ?").run(code);
  }
}
