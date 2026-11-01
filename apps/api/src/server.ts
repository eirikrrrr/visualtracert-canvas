// The accounts' HTTP API, behind the web's nginx at /auth:
//   GET    /auth/status               { setup, user }: is there any account yet, and who is signed in
//   POST   /auth/setup                { code, username, name, password }: the first account (admin), signed in;
//                                     code: the one the API prints in its log while there is no account
//   POST   /auth/register             { invite, username, name, password }: an account from an invitation, signed in
//   POST   /auth/login                { username, password }
//   POST   /auth/logout
//   PATCH  /auth/me                   { name }
//   POST   /auth/me/password          { current, next }: the other sessions end
//   GET    /auth/users                (admin) every account
//   PATCH  /auth/users/:id            (admin) { role?, disabled?, name? }
//   POST   /auth/users/:id/password   (admin) { password }: to be changed at the next sign-in
//   DELETE /auth/users/:id            (admin)
//   GET    /auth/invites              (admin) the invitations still usable
//   POST   /auth/invites              (admin) { role?, uses?, days?, note? }
//   DELETE /auth/invites/:code        (admin)
//   GET    /auth/solves               the exercises the user solved
//   POST   /auth/solves               { exercise, difficulty, timeMs?, lab? }: one solved. Medium: checked
//                                     first by the emulator on the lab's devices ({ ok, results, solve? })
//   POST   /auth/solves/import        { solves }: what this browser had solved before (not verified)
//   GET    /auth/rankings?season=     the ranking (everyone's, or a season's)
//   GET    /auth/figures              each machine: how many solved it, and who first
//   GET    /auth/progress             (teacher, admin) everyone's progress
//   GET    /auth/seasons              the seasons
//   POST   /auth/seasons              (admin) { name, theme, summary?, inspiration?, color?, icon?, startsAt, endsAt, machines }
//   PATCH  /auth/seasons/:id          (admin)
//   DELETE /auth/seasons/:id          (admin)
//   GET    /auth/machines             what the admins changed of the machines, and their own
//   PUT    /auth/machines/:id         (admin) an edit of one of the app's ({ codename?, title?, story?, summary?,
//                                     level?, xp?, image?, pdf?, hidden?, protocols? }), or one of their own
//                                     (all of that and box, icon, goals, hints, cli?, start, solution)
//   DELETE /auth/machines/:id         (admin) back to the app's own, or gone
//   POST   /auth/files                (admin) a file as the body (PNG, JPEG, WebP up to 2 MB; PDF up to 10 MB)
//   GET    /auth/files/:id            a file
//   GET    /auth/labs                 the account's labs (id, name, updatedAt, size)
//   GET    /auth/labs/:id             one, with its document
//   PUT    /auth/labs/:id             { document, updatedAt }: saved, unless the account's copy is newer ({ kept })
//   DELETE /auth/labs/:id
//   GET    /auth/labs/:id/versions    its earlier versions
//   GET    /auth/labs/:id/versions/:savedAt  one of them, with its document
//   GET    /auth/me/settings          { data, updatedAt }: profile, preferences, practice's progress
//   PUT    /auth/me/settings          { data }
//   GET    /auth/providers            the services to sign in with (["github", "google"], those set up)
//   GET    /auth/oauth/:provider      to the provider (?link=1, signed in: links it to this account)
//   GET    /auth/oauth/:provider/callback  back from it: signed in (a new account if none), then to the app
//   GET    /auth/me/identities        { hasPassword, identities }: the services linked to the account
//   DELETE /auth/me/identities/:provider  unlinks one (not the account's only way in)
//   GET    /auth/check                nginx asks it before every /api request (auth_request):
//                                     204 with X-User-* headers, 401 without a session, 403 if not allowed
// The session is a cookie (HttpOnly, SameSite=Strict; Secure behind HTTPS).
// What changes something must come as JSON from this same site (Origin), so
// another site cannot make the browser do it. Errors are { error: code }.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { exerciseById } from "@visual-tracert/model";
import { version } from "../../../package.json";
import { AccountError, Accounts, type ErrorCode, type User } from "./accounts";
import { FILE_TYPES } from "./machines";
import { finishFlow, PENDING_TTL, startFlow, type Pending, type ProviderConfig } from "./oauth";
import type { Practice } from "./practice";

export const COOKIE = "vt_session";
const MAX_BODY = 16 * 1024;
/** a machine of their own carries two labs */
const MAX_MACHINE = 512 * 1024;
/** a lab's document (and the settings) come as JSON strings inside the body */
const MAX_LAB = 600 * 1024;
const WINDOW = 15 * 60 * 1000;
/** failed sign-ins allowed per window: from one address, and for one username */
const LIMITS = { address: 20, username: 8 };

/** failures in a window of time, by key */
class Attempts {
  private readonly seen = new Map<string, { count: number; until: number }>();
  constructor(private readonly now: () => number) {}
  blocked(key: string, limit: number): boolean {
    const entry = this.seen.get(key);
    return Boolean(entry && entry.until > this.now() && entry.count >= limit);
  }
  fail(key: string): void {
    const entry = this.seen.get(key);
    if(!entry || entry.until <= this.now()) this.seen.set(key, { count: 1, until: this.now() + WINDOW });
    else entry.count++;
  }
  clear(key: string): void {
    this.seen.delete(key);
  }
  prune(): void {
    for(const [key, entry] of this.seen) if(entry.until <= this.now()) this.seen.delete(key);
  }
}

class HttpError extends AccountError {}

function cookieOf(req: IncomingMessage): string | undefined {
  for(const part of (req.headers.cookie ?? "").split(";")){
    const [name, ...value] = part.trim().split("=");
    if(name === COOKIE) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

/** the request comes from this same site: its Origin (if any) is the host it was sent to */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if(!origin) return true;
  const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host;
  try{ return new URL(origin).host === host; }catch(_){ return false; }
}

/** the body as it came, up to a size */
function rawOf(req: IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if(size > max){ reject(new HttpError("too-large", 413)); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function bodyOf(req: IncomingMessage, max = MAX_BODY): Promise<Record<string, unknown>> {
  if(!(req.headers["content-type"] ?? "").startsWith("application/json")) throw new HttpError("bad-request", 415);
  const raw = await rawOf(req, max).catch(() => { throw new HttpError("bad-request", 413); });
  try{
    const data = raw.length ? JSON.parse(raw.toString("utf8")) : {};
    if(!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    return data;
  }catch(_){ throw new HttpError("bad-request"); }
}

function send(res: ServerResponse, code: number, data?: unknown, headers: Record<string, string | string[]> = {}) {
  if(data === undefined){ res.writeHead(code, { "Cache-Control": "no-store", ...headers }); res.end(); return; }
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(data));
}

export interface OAuthOptions {
  providers: ProviderConfig[];
  /** the address the providers send back to (https://visualtracert.online); else the request's */
  publicUrl?: string;
  fetch?: typeof fetch;
}

/** a page that goes on to another address: after the provider's redirect, a new
 * navigation of this site's own, so the SameSite=Strict session cookie goes with it */
function goTo(res: ServerResponse, location: string, headers: Record<string, string | string[]> = {}) {
  const safe = location.replace(/[^A-Za-z0-9/?=&_.:#-]/g, "");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...headers });
  res.end(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${safe}"><title>visual-tracert</title><a href="${safe}">visual-tracert</a>`);
}

export interface ServerOptions {
  /** Secure cookies: always, never, or when the request came over HTTPS (X-Forwarded-Proto) */
  secureCookies?: "auto" | "always" | "never";
  /** what the first account must give: whoever reaches the page first cannot make themselves admin */
  setupCode?: string;
  /** signing in with GitHub and Google */
  oauth?: OAuthOptions;
  /** asks the emulator to check an exercise (medium) on a lab's devices, as the user */
  verify?: (lab: string, exercise: string, user: User, lang: string) => Promise<Verdict>;
  now?: () => number;
}

/** the emulator's answer when it checks an exercise on a lab's devices */
export interface Verdict {
  ok: boolean;
  results: { ok: boolean; detail: string }[];
  startedAt: number;
}

/** the emulator checks it (EMULATOR_URL), told who asks as nginx would tell it */
export function emulatorVerifier(base: string) {
  return async (lab: string, exercise: string, user: User, lang: string): Promise<Verdict> => {
    let res: Response;
    try{
      res = await fetch(`${base}/api/labs/${encodeURIComponent(lab)}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": lang, "X-User-Id": String(user.id), "X-User-Name": user.username, "X-User-Role": user.role },
        // one an admin made: the emulator does not have it, so it goes along
        body: JSON.stringify({ exercise, ...definitionOf(exercise) }),
      });
    }catch(_){
      throw new HttpError("emulator-unavailable", 502);
    }
    const data = await res.json().catch(() => null) as (Verdict & { error?: string }) | null;
    if(!res.ok || !data) throw new VerifyRefused(data?.error ?? String(res.status));
    return data;
  };
}

/** an admin's machine, for the emulator to check: how it starts and its goals */
function definitionOf(id: string) {
  const machine = exerciseById(id);
  return machine?.custom && machine.cli ? { definition: { start: machine.build(), goals: machine.goals } } : {};
}

/** the emulator would not check it (not deployed, not the exercise as it starts…): its words */
export class VerifyRefused extends Error {}

/** what of the emulator only an admin may do: change the server's images and profiles */
export function adminOnly(method: string, uri: string): boolean {
  if(method === "GET" || method === "HEAD") return false;
  const path = uri.split("?")[0];
  return /^\/api\/(images|profiles)(\/|$)/.test(path);
}

export function createHandler(accounts: Accounts, practice: Practice, options: ServerOptions = {}) {
  const now = options.now ?? Date.now;
  const attempts = new Attempts(now);
  const prune = setInterval(() => { attempts.prune(); accounts.pruneSessions(); }, 60 * 60 * 1000);
  prune.unref();

  const secure = (req: IncomingMessage) => options.secureCookies === "always"
    || (options.secureCookies !== "never" && req.headers["x-forwarded-proto"] === "https");
  const setCookie = (req: IncomingMessage, token: string, maxAge: number) =>
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(maxAge / 1000)}${secure(req) ? "; Secure" : ""}`;
  const signIn = (req: IncomingMessage, res: ServerResponse, user: User, code = 200) => {
    const token = accounts.createSession(user.id, req.headers["user-agent"]);
    send(res, code, { user }, { "Set-Cookie": setCookie(req, token, 30 * 24 * 60 * 60 * 1000) });
  };
  const signedIn = (req: IncomingMessage): User => {
    const user = accounts.session(cookieOf(req));
    if(!user) throw new HttpError("unauthorized", 401);
    return user;
  };
  const admin = (req: IncomingMessage): User => {
    const user = signedIn(req);
    if(user.role !== "admin" || user.mustChange) throw new HttpError("forbidden", 403);
    return user;
  };
  const staff = (req: IncomingMessage): User => {
    const user = signedIn(req);
    if((user.role !== "admin" && user.role !== "teacher") || user.mustChange) throw new HttpError("forbidden", 403);
    return user;
  };
  // the flows on their way to a provider and back, by their state (they last ten minutes)
  const pending = new Map<string, Pending>();
  const providers = options.oauth?.providers ?? [];
  const originOf = (req: IncomingMessage) => options.oauth?.publicUrl?.replace(/\/+$/, "")
    ?? `${secure(req) ? "https" : "http"}://${(req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host}`;
  const callbackOf = (req: IncomingMessage, provider: string) => `${originOf(req)}/auth/oauth/${provider}/callback`;
  const OAUTH_COOKIE = "vt_oauth";
  const oauthCookie = (req: IncomingMessage, value: string, maxAge: number) =>
    `${OAUTH_COOKIE}=${value}; Path=/auth/oauth; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure(req) ? "; Secure" : ""}`;
  const readCookie = (req: IncomingMessage, name: string) => {
    for(const part of (req.headers.cookie ?? "").split(";")){
      const [key, ...value] = part.trim().split("=");
      if(key === name) return value.join("=");
    }
    return undefined;
  };

  const addressOf = (req: IncomingMessage) => (req.headers["x-real-ip"] as string | undefined) ?? req.socket.remoteAddress ?? "?";

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const method = req.method ?? "GET";
    const path = url.pathname.replace(/\/+$/, "");
    try{
      if(path === "/auth/health" && method === "GET"){ send(res, 200, { ok: true, version }); return; }

      // nginx, before an emulator request: who, and may they
      if(path === "/auth/check"){
        const user = accounts.session(cookieOf(req));
        if(!user){ send(res, 401); return; }
        const uri = (req.headers["x-original-uri"] as string | undefined) ?? "/";
        const originalMethod = (req.headers["x-original-method"] as string | undefined) ?? "GET";
        if(!sameOrigin(req) || user.mustChange || (adminOnly(originalMethod, uri) && user.role !== "admin")){ send(res, 403); return; }
        send(res, 204, undefined, { "X-User-Id": String(user.id), "X-User-Name": user.username, "X-User-Role": user.role });
        return;
      }

      if(path === "/auth/status" && method === "GET"){
        send(res, 200, { setup: accounts.needsSetup(), user: accounts.session(cookieOf(req)) ?? null });
        return;
      }

      // everything else changes something: from this site only
      if(method !== "GET" && !sameOrigin(req)) throw new HttpError("forbidden", 403);

      if(path === "/auth/setup" && method === "POST"){
        const body = await bodyOf(req);
        if(!accounts.needsSetup()) throw new HttpError("already-set-up", 409);
        if(options.setupCode && String(body.code ?? "").trim().toUpperCase() !== options.setupCode) throw new HttpError("invalid-setup-code", 403);
        signIn(req, res, await accounts.setup(body), 201);
        return;
      }
      if(path === "/auth/register" && method === "POST"){ signIn(req, res, await accounts.register(await bodyOf(req)), 201); return; }
      if(path === "/auth/login" && method === "POST"){
        const body = await bodyOf(req);
        const address = `address:${addressOf(req)}`;
        const username = `username:${String(body.username ?? "").toLowerCase()}`;
        if(attempts.blocked(address, LIMITS.address) || attempts.blocked(username, LIMITS.username)) throw new HttpError("too-many-attempts", 429);
        try{
          const user = await accounts.authenticate(body.username, body.password);
          attempts.clear(username);
          signIn(req, res, user);
        }catch(error){
          if(error instanceof AccountError && error.code === "invalid-credentials"){ attempts.fail(address); attempts.fail(username); }
          throw error;
        }
        return;
      }
      if(path === "/auth/logout" && method === "POST"){
        accounts.endSession(cookieOf(req));
        send(res, 204, undefined, { "Set-Cookie": setCookie(req, "", 0) });
        return;
      }

      if(path === "/auth/me" && method === "PATCH"){
        const user = signedIn(req);
        send(res, 200, { user: accounts.rename(user.id, (await bodyOf(req)).name) });
        return;
      }
      if(path === "/auth/me/password" && method === "POST"){
        const user = signedIn(req);
        const body = await bodyOf(req);
        send(res, 200, { user: await accounts.changePassword(user.id, body.current, body.next, cookieOf(req)) });
        return;
      }

      if(path === "/auth/users" && method === "GET"){ admin(req); send(res, 200, accounts.users()); return; }
      const userMatch = path.match(/^\/auth\/users\/(\d+)(\/password)?$/);
      if(userMatch){
        const by = admin(req);
        const id = Number(userMatch[1]);
        if(userMatch[2] && method === "POST"){ send(res, 200, { user: await accounts.resetPassword(id, (await bodyOf(req)).password) }); return; }
        if(!userMatch[2] && method === "PATCH"){ send(res, 200, { user: accounts.updateUser(id, await bodyOf(req)) }); return; }
        if(!userMatch[2] && method === "DELETE"){
          if(id === by.id) throw new HttpError("bad-request");
          accounts.deleteUser(id);
          send(res, 204);
          return;
        }
      }

      if(path === "/auth/invites" && method === "GET"){ admin(req); send(res, 200, accounts.invites()); return; }
      if(path === "/auth/invites" && method === "POST"){ const by = admin(req); send(res, 201, accounts.createInvite(by.id, await bodyOf(req))); return; }
      const inviteMatch = path.match(/^\/auth\/invites\/([A-Z0-9-]{1,20})$/);
      if(inviteMatch && method === "DELETE"){ admin(req); accounts.deleteInvite(inviteMatch[1]); send(res, 204); return; }

      if(path === "/auth/solves" && method === "GET"){ send(res, 200, practice.solves(signedIn(req).id)); return; }
      if(path === "/auth/solves" && method === "POST"){
        const user = signedIn(req);
        const body = await bodyOf(req);
        if(body.difficulty !== "medium"){ send(res, 200, { ok: true, solve: practice.record(user.id, body, false) }); return; }
        // medium: the emulator checks it on the lab's devices, and measures its time
        if(typeof body.lab !== "string" || typeof body.exercise !== "string" || !options.verify) throw new HttpError("bad-request");
        let verdict: Verdict;
        try{ verdict = await options.verify(body.lab, body.exercise, user, String(req.headers["accept-language"] ?? "es")); }
        catch(error){ if(error instanceof VerifyRefused){ send(res, 409, { error: "not-verified", message: error.message }); return; } throw error; }
        if(!verdict.ok){ send(res, 200, { ok: false, results: verdict.results }); return; }
        const solve = practice.record(user.id, { exercise: body.exercise, difficulty: "medium", timeMs: now() - verdict.startedAt }, true);
        send(res, 200, { ok: true, results: verdict.results, solve });
        return;
      }
      if(path === "/auth/solves/import" && method === "POST"){ const user = signedIn(req); send(res, 200, practice.import(user.id, (await bodyOf(req)).solves)); return; }
      if(path === "/auth/rankings" && method === "GET"){
        const user = signedIn(req);
        const season = url.searchParams.get("season");
        const entries = practice.ranking(season ? Number(season) || -1 : undefined);
        send(res, 200, { entries: entries.slice(0, 100), me: entries.find(entry => entry.id === user.id) ?? null, total: entries.length });
        return;
      }
      if(path === "/auth/figures" && method === "GET"){ signedIn(req); send(res, 200, practice.figures()); return; }
      if(path === "/auth/progress" && method === "GET"){ staff(req); send(res, 200, practice.progress()); return; }
      if(path === "/auth/seasons" && method === "GET"){ signedIn(req); send(res, 200, practice.seasons()); return; }
      if(path === "/auth/seasons" && method === "POST"){ admin(req); send(res, 201, practice.createSeason(await bodyOf(req))); return; }
      const seasonMatch = path.match(/^\/auth\/seasons\/(\d+)$/);
      if(seasonMatch && method === "PATCH"){ admin(req); send(res, 200, practice.updateSeason(Number(seasonMatch[1]), await bodyOf(req))); return; }
      if(seasonMatch && method === "DELETE"){ admin(req); practice.deleteSeason(Number(seasonMatch[1])); send(res, 204); return; }

      if(path === "/auth/providers" && method === "GET"){ send(res, 200, providers.map(item => item.id)); return; }
      const oauthMatch = path.match(/^\/auth\/oauth\/(github|google)(\/callback)?$/);
      if(oauthMatch && method === "GET"){
        const provider = providers.find(item => item.id === oauthMatch[1]);
        if(!provider){ goTo(res, "/?auth_error=oauth-unavailable"); return; }
        if(!oauthMatch[2]){
          for(const [state, flow] of pending) if(flow.expires <= now()) pending.delete(state);
          const link = url.searchParams.get("link") === "1" ? accounts.session(cookieOf(req))?.id : undefined;
          const flow = startFlow(provider, callbackOf(req, provider.id), now(), link);
          pending.set(flow.pending.state, flow.pending);
          res.writeHead(302, { Location: flow.url, "Cache-Control": "no-store", "Set-Cookie": oauthCookie(req, flow.pending.state, PENDING_TTL / 1000) });
          res.end();
          return;
        }
        const state = url.searchParams.get("state") ?? "";
        const flow = pending.get(state);
        const clear = { "Set-Cookie": oauthCookie(req, "", 0) };
        // this browser's own flow, still fresh, and for this provider
        if(!flow || readCookie(req, OAUTH_COOKIE) !== state || flow.expires <= now() || flow.provider !== provider.id || url.searchParams.get("error")){
          if(flow) pending.delete(state);
          goTo(res, "/?auth_error=oauth-failed", clear);
          return;
        }
        pending.delete(state);
        try{
          const profile = await finishFlow(provider, url.searchParams.get("code") ?? "", callbackOf(req, provider.id), flow, options.oauth?.fetch);
          const user = accounts.signInWith(profile, flow.link);
          if(flow.link !== undefined){ goTo(res, `/?linked=${provider.id}`, clear); return; }
          const token = accounts.createSession(user.id, req.headers["user-agent"]);
          goTo(res, "/", { "Set-Cookie": [oauthCookie(req, "", 0), setCookie(req, token, 30 * 24 * 60 * 60 * 1000)] });
        }catch(error){
          const code = error instanceof AccountError ? error.code : "oauth-failed";
          if(!(error instanceof AccountError)) console.error("oauth:", (error as Error).message);
          goTo(res, `/?auth_error=${code}`, clear);
        }
        return;
      }
      if(path === "/auth/me/identities" && method === "GET"){
        const user = signedIn(req);
        send(res, 200, { hasPassword: user.hasPassword, identities: accounts.identities(user.id).map(({ provider, email, createdAt }) => ({ provider, email, createdAt })) });
        return;
      }
      const identityMatch = path.match(/^\/auth\/me\/identities\/(github|google)$/);
      if(identityMatch && method === "DELETE"){ accounts.unlink(signedIn(req).id, identityMatch[1]); send(res, 204); return; }
      if(path === "/auth/labs" && method === "GET"){ send(res, 200, practice.data.labs(signedIn(req).id)); return; }
      const labMatch = path.match(/^\/auth\/labs\/([A-Za-z0-9_-]{1,80})(?:\/versions(?:\/(\d{1,16}))?)?$/);
      if(labMatch){
        const user = signedIn(req);
        const [, id, savedAt] = labMatch;
        if(path.includes("/versions")){
          if(method !== "GET") throw new HttpError("not-found", 404);
          send(res, 200, savedAt ? practice.data.version(user.id, id, Number(savedAt)) : practice.data.versions(user.id, id));
          return;
        }
        if(method === "GET"){ send(res, 200, practice.data.lab(user.id, id)); return; }
        if(method === "PUT"){ send(res, 200, practice.data.saveLab(user.id, id, await bodyOf(req, MAX_LAB))); return; }
        if(method === "DELETE"){ practice.data.deleteLab(user.id, id); send(res, 204); return; }
      }
      if(path === "/auth/me/settings" && method === "GET"){ send(res, 200, practice.data.settings(signedIn(req).id)); return; }
      if(path === "/auth/me/settings" && method === "PUT"){ const user = signedIn(req); send(res, 200, practice.data.saveSettings(user.id, await bodyOf(req, MAX_LAB))); return; }
      if(path === "/auth/machines" && method === "GET"){ signedIn(req); send(res, 200, practice.machines.list()); return; }
      const machineMatch = path.match(/^\/auth\/machines\/([a-z0-9-]{1,40})$/);
      if(machineMatch && method === "PUT"){ const by = admin(req); send(res, 200, practice.machines.put(machineMatch[1], await bodyOf(req, MAX_MACHINE), by.id)); return; }
      if(machineMatch && method === "DELETE"){ admin(req); practice.machines.remove(machineMatch[1]); send(res, 204); return; }
      if(path === "/auth/files" && method === "POST"){
        const by = admin(req);
        const mime = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
        if(!FILE_TYPES[mime]) throw new HttpError("bad-file", 415);
        send(res, 201, practice.machines.addFile(mime, await rawOf(req, FILE_TYPES[mime]), by.id));
        return;
      }
      const fileMatch = path.match(/^\/auth\/files\/([a-f0-9]{32})$/);
      if(fileMatch && method === "GET"){
        signedIn(req);
        const file = practice.machines.file(fileMatch[1]);
        if(!file) throw new HttpError("not-found", 404);
        // never run as a page: shown as an image or a PDF, or downloaded
        res.writeHead(200, { "Content-Type": file.mime, "Content-Length": file.data.length, "Cache-Control": "private, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline", ...(file.mime.startsWith("image/") ? { "Content-Security-Policy": "default-src 'none'" } : {}) });
        res.end(file.data);
        return;
      }

      throw new HttpError("not-found", 404);
    }catch(error){
      if(error instanceof AccountError){ send(res, error.status, { error: error.code satisfies ErrorCode, ...(error.detail ? { detail: error.detail } : {}) }); return; }
      console.error(error);
      send(res, 500, { error: "server" });
    }
  };
}

export function startServer(accounts: Accounts, practice: Practice, port: number, options: ServerOptions = {}) {
  const server = createServer(createHandler(accounts, practice, options));
  server.listen(port, () => console.log(`visual-tracert api ${version} on :${port}`));
  return server;
}
