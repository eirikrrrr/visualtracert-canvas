import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "./accounts";
import { openDatabase } from "./db";
import { hashPassword, verifyPassword } from "./passwords";
import { Practice } from "./practice";
import { adminOnly, COOKIE, startServer, VerifyRefused, type Verdict } from "./server";

const SETUP = "C0DE1234";
let base = "";
/** the emulator, pretended: lab "solved" passes, "broken" fails a goal, "gone" is refused */
const fakeVerify = async (lab: string): Promise<Verdict> => {
  if(lab === "gone") throw new VerifyRefused("El laboratorio no está desplegado.");
  return { ok: lab === "solved", results: [{ ok: lab === "solved", detail: "ping" }], startedAt: Date.now() - 90_000 };
};
let server: ReturnType<typeof startServer>;

beforeAll(async () => {
  const db = openDatabase(":memory:");
  server = startServer(new Accounts(db), new Practice(db), 0, { setupCode: SETUP, verify: fakeVerify });
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });

/** a browser: keeps its session cookie */
function browser() {
  let cookie = "";
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if(set) cookie = set.split(";")[0].endsWith("=") ? "" : set.split(";")[0];
    const text = await res.text();
    return { status: res.status, data: text ? JSON.parse(text) : undefined, headers: res.headers };
  };
  return { call, cookie: () => cookie };
}

describe("passwords", () => {
  it("verifies only the right one", async () => {
    const hash = await hashPassword("correct horse");
    expect(hash).toMatch(/^scrypt\$32768\$8\$3\$/);
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("correct hors", hash)).toBe(false);
  });
});

/** the first account's browser: the tests share it (its sign-in gets blocked on purpose) */
const firstAdmin = browser();

describe("accounts API", () => {
  const admin = firstAdmin;
  const student = browser();
  let invite = "";

  it("asks for the first account, with the setup code", async () => {
    expect((await admin.call("GET", "/auth/status")).data).toEqual({ setup: true, user: null });
    const wrong = await admin.call("POST", "/auth/setup", { code: "nope", username: "admin", name: "Admin", password: "a-long-password" });
    expect(wrong).toMatchObject({ status: 403, data: { error: "invalid-setup-code" } });
    const made = await admin.call("POST", "/auth/setup", { code: SETUP.toLowerCase(), username: "Admin", name: " The  Admin ", password: "a-long-password" });
    expect(made.status).toBe(201);
    expect(made.data.user).toMatchObject({ username: "admin", name: "The Admin", role: "admin" });
    expect(made.headers.get("set-cookie")).toMatch(new RegExp(`^${COOKIE}=[^;]+; Path=/; HttpOnly; SameSite=Strict`));
    expect((await admin.call("GET", "/auth/status")).data).toMatchObject({ setup: false, user: { username: "admin" } });
    // only once
    expect((await browser().call("POST", "/auth/setup", { code: SETUP, username: "other", name: "O", password: "a-long-password" })).status).toBe(409);
  });

  it("registers only with a usable invitation, in its role", async () => {
    expect((await student.call("POST", "/auth/invites", { role: "student" })).status).toBe(401);
    const made = await admin.call("POST", "/auth/invites", { role: "student", uses: 1, note: "Aula 3" });
    expect(made.status).toBe(201);
    invite = made.data.code;
    expect(invite).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    expect((await student.call("POST", "/auth/register", { invite: "AAAA-BBBB-CCCC", username: "ana", name: "Ana", password: "another-password" })).data.error).toBe("invalid-invite");
    expect((await student.call("POST", "/auth/register", { invite, username: "a", name: "Ana", password: "another-password" })).data.error).toBe("bad-username");
    expect((await student.call("POST", "/auth/register", { invite, username: "ana", name: "Ana", password: "short" })).data.error).toBe("bad-password");
    const ok = await student.call("POST", "/auth/register", { invite: ` ${invite.toLowerCase()} `, username: "ana", name: "Ana", password: "another-password" });
    expect(ok).toMatchObject({ status: 201, data: { user: { username: "ana", role: "student" } } });
    // used up
    expect((await browser().call("POST", "/auth/register", { invite, username: "bob", name: "Bob", password: "another-password" })).data.error).toBe("invalid-invite");
    expect((await admin.call("GET", "/auth/invites")).data).toEqual([]);
  });

  it("signs in and out", async () => {
    const someone = browser();
    expect((await someone.call("POST", "/auth/login", { username: "ana", password: "wrong-password" })).data.error).toBe("invalid-credentials");
    expect((await someone.call("POST", "/auth/login", { username: "nobody", password: "whatever-pass" })).data.error).toBe("invalid-credentials");
    const ok = await someone.call("POST", "/auth/login", { username: "ANA", password: "another-password" });
    expect(ok.data.user.username).toBe("ana");
    expect((await someone.call("GET", "/auth/status")).data.user.username).toBe("ana");
    expect((await someone.call("POST", "/auth/logout", {})).status).toBe(204);
    expect(someone.cookie()).toBe("");
    expect((await someone.call("GET", "/auth/status")).data.user).toBeNull();
  });

  it("stops guessing a password after a few failures", async () => {
    const guesser = browser();
    for(let i = 0; i < 8; i++) await guesser.call("POST", "/auth/login", { username: "admin", password: `guess-number-${i}` });
    expect((await guesser.call("POST", "/auth/login", { username: "admin", password: "a-long-password" })).status).toBe(429);
  });

  it("refuses changes from another site, and non-JSON bodies", async () => {
    expect((await browser().call("POST", "/auth/login", { username: "ana", password: "another-password" }, { Origin: "https://evil.example" })).status).toBe(403);
    const form = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "username=ana" });
    expect(form.status).toBe(415);
  });

  it("checks every emulator request for nginx", async () => {
    const check = (who: ReturnType<typeof browser>, method: string, uri: string, origin?: string) =>
      who.call("GET", "/auth/check", undefined, { "X-Original-Method": method, "X-Original-URI": uri, ...(origin ? { Origin: origin, "X-Forwarded-Host": "lab.example" } : {}) });
    expect((await check(browser(), "GET", "/api/labs")).status).toBe(401);
    const ok = await check(student, "GET", "/api/labs/lab-1/devices/pc-1/shell");
    expect(ok.status).toBe(204);
    expect(ok.headers.get("x-user-name")).toBe("ana");
    expect(ok.headers.get("x-user-role")).toBe("student");
    // the server's images and profiles: admins only
    expect((await check(student, "POST", "/api/images/routeros/pull")).status).toBe(403);
    expect((await check(student, "GET", "/api/images")).status).toBe(204);
    expect((await check(admin, "DELETE", "/api/profiles/alpine-lldp")).status).toBe(204);
    // a WebSocket opened by another site's page
    expect((await check(student, "GET", "/api/labs/x/devices/pc/shell", "https://evil.example")).status).toBe(403);
    expect((await check(student, "GET", "/api/labs/x/devices/pc/shell", "http://lab.example")).status).toBe(204);
  });

  it("lets an admin manage accounts, but never remove the last admin", async () => {
    const users = (await admin.call("GET", "/auth/users")).data;
    expect(users.map((user: { username: string }) => user.username)).toEqual(["admin", "ana"]);
    expect(users[0].password).toBeUndefined();
    expect((await student.call("GET", "/auth/users")).status).toBe(403);
    const adminId = users[0].id, anaId = users[1].id;
    expect((await admin.call("PATCH", `/auth/users/${adminId}`, { role: "student" })).data.error).toBe("last-admin");
    expect((await admin.call("PATCH", `/auth/users/${anaId}`, { role: "teacher" })).data.user.role).toBe("teacher");
    // a password set by the admin: her sessions end, and she must change it
    await admin.call("POST", `/auth/users/${anaId}/password`, { password: "temporary-pass" });
    expect((await student.call("GET", "/auth/status")).data.user).toBeNull();
    await student.call("POST", "/auth/login", { username: "ana", password: "temporary-pass" });
    expect((await student.call("GET", "/auth/status")).data.user.mustChange).toBe(true);
    expect((await student.call("GET", "/auth/check", undefined, { "X-Original-URI": "/api/labs" })).status).toBe(403);
    expect((await student.call("POST", "/auth/me/password", { current: "wrong", next: "her-own-password" })).data.error).toBe("wrong-password");
    expect((await student.call("POST", "/auth/me/password", { current: "temporary-pass", next: "her-own-password" })).data.user.mustChange).toBe(false);
    expect((await student.call("GET", "/auth/check", undefined, { "X-Original-URI": "/api/labs" })).status).toBe(204);
    // disabled: out at once
    await admin.call("PATCH", `/auth/users/${anaId}`, { disabled: true });
    expect((await student.call("GET", "/auth/status")).data.user).toBeNull();
    expect((await browser().call("POST", "/auth/login", { username: "ana", password: "her-own-password" })).data.error).toBe("disabled");
    expect((await admin.call("DELETE", `/auth/users/${anaId}`)).status).toBe(204);
    expect((await admin.call("DELETE", `/auth/users/${adminId}`)).status).toBe(400);
  });
});

describe("what only an admin may do", () => {
  it("is changing the server's images and profiles", () => {
    expect(adminOnly("POST", "/api/images/routeros/pull")).toBe(true);
    expect(adminOnly("PUT", "/api/profiles/x?lang=es")).toBe(true);
    expect(adminOnly("GET", "/api/images")).toBe(false);
    expect(adminOnly("PUT", "/api/labs/lab-1")).toBe(false);
    expect(adminOnly("POST", "/api/imagesx")).toBe(false);
  });
});

describe("sessions", () => {
  it("expire after 30 days unused", async () => {
    let now = 1_000_000;
    const accounts = new Accounts(openDatabase(":memory:"), () => now);
    const user = await accounts.setup({ username: "solo", name: "Solo", password: "a-long-password" });
    const token = accounts.createSession(user.id);
    now += 29 * 24 * 3600e3;
    expect(accounts.session(token)?.username).toBe("solo");
    // used: renewed
    now += 29 * 24 * 3600e3;
    expect(accounts.session(token)?.username).toBe("solo");
    now += 31 * 24 * 3600e3;
    expect(accounts.session(token)).toBeUndefined();
  });
});

describe("practice: solves, ranking, machines and seasons", () => {
  const admin = firstAdmin;
  const ana = browser();
  const bob = browser();

  it("records solves: easy as told, medium only once the emulator checks it", async () => {
    for(const [who, username] of [[ana, "ana2"], [bob, "bob2"]] as const){
      const invite = (await admin.call("POST", "/auth/invites", { role: "student" })).data.code;
      await who.call("POST", "/auth/register", { invite, username, name: username.toUpperCase(), password: "another-password" });
    }
    expect((await ana.call("POST", "/auth/solves", { exercise: "first-network", difficulty: "easy", timeMs: 50_000 })).data.solve)
      .toMatchObject({ exercise: "first-network", difficulty: "easy", timeMs: 50_000, verified: false });
    expect((await ana.call("POST", "/auth/solves", { exercise: "nope", difficulty: "easy" })).status).toBe(400);
    // a medium solve the devices do not show yet, and one they do
    expect((await ana.call("POST", "/auth/solves", { exercise: "first-network", difficulty: "medium", lab: "broken" })).data).toMatchObject({ ok: false });
    expect((await ana.call("POST", "/auth/solves", { exercise: "first-network", difficulty: "medium", lab: "gone" }))).toMatchObject({ status: 409, data: { error: "not-verified" } });
    const medium = await ana.call("POST", "/auth/solves", { exercise: "first-network", difficulty: "medium", lab: "solved", timeMs: 1 });
    expect(medium.data.solve.verified).toBe(true);
    // its time is the server's, from when the lab was deployed
    expect(medium.data.solve.timeMs).toBeGreaterThanOrEqual(90_000);
    // a slower time does not replace the best
    await ana.call("POST", "/auth/solves", { exercise: "first-network", difficulty: "easy", timeMs: 80_000 });
    expect((await ana.call("GET", "/auth/solves")).data.find((solve: { difficulty: string }) => solve.difficulty === "easy").timeMs).toBe(50_000);
  });

  it("ranks by XP and tells who solved each machine first", async () => {
    await bob.call("POST", "/auth/solves/import", { solves: [
      { exercise: "first-network", difficulty: "easy", solvedAt: 1000, timeMs: 30_000 },
      { exercise: "subnet-mask", difficulty: "easy" },
      { exercise: "bad", difficulty: "easy" },
    ] });
    const ranking = (await ana.call("GET", "/auth/rankings")).data;
    // ana: 10 + 20 (medium) = 30; bob: 10 + 20 = 30 too, but he reached it later (his last solve is now)
    expect(ranking.entries.map((entry: { username: string; xp: number }) => [entry.username, entry.xp])).toEqual([["ana2", 30], ["bob2", 30]]);
    expect(ranking.me).toMatchObject({ username: "ana2", position: 1, verified: 1, rank: "Novato" });
    const figures = (await ana.call("GET", "/auth/figures")).data;
    expect(figures["first-network"].easy).toMatchObject({ solves: 2, first: { username: "bob2" } });
    expect(figures["first-network"].medium).toMatchObject({ solves: 1, first: { username: "ana2" } });
  });

  it("lets an admin make seasons, each with its own ranking", async () => {
    const season = { name: "Temporada 1", theme: "IP", inspiration: "Direcciones y máscaras", startsAt: Date.now() - 1000, endsAt: Date.now() + 3600e3, machines: ["first-network"] };
    expect((await ana.call("POST", "/auth/seasons", season)).status).toBe(403);
    expect((await admin.call("POST", "/auth/seasons", { ...season, machines: ["nope"] })).status).toBe(400);
    const made = (await admin.call("POST", "/auth/seasons", season)).data;
    expect(made).toMatchObject({ name: "Temporada 1", theme: "IP", machines: ["first-network"], color: "#4f8cff" });
    // only ana solved its machine within its dates
    const ranking = (await ana.call("GET", `/auth/rankings?season=${made.id}`)).data;
    expect(ranking.entries.map((entry: { username: string }) => entry.username)).toEqual(["ana2"]);
    expect((await admin.call("PATCH", `/auth/seasons/${made.id}`, { theme: "BGP" })).data.theme).toBe("BGP");
    expect((await ana.call("GET", "/auth/seasons")).data).toHaveLength(1);
    expect((await admin.call("DELETE", `/auth/seasons/${made.id}`)).status).toBe(204);
  });

  it("shows everyone's progress to teachers and admins only", async () => {
    expect((await ana.call("GET", "/auth/progress")).status).toBe(403);
    const progress = (await admin.call("GET", "/auth/progress")).data;
    expect(progress.find((user: { username: string }) => user.username === "ana2")).toMatchObject({ xp: 30 });
  });

  it("lets an admin edit the machines, make their own and upload their files", async () => {
    expect((await ana.call("PUT", "/auth/machines/first-network", { xp: 50 })).status).toBe(403);
    expect((await admin.call("PUT", "/auth/machines/first-network", { xp: -5 })).data).toMatchObject({ error: "bad-machine", detail: "xp" });
    expect((await admin.call("PUT", "/auth/machines/first-network", { codename: "Hola de Nuevo", xp: 50 })).status).toBe(200);
    expect((await ana.call("GET", "/auth/machines")).data).toMatchObject([{ id: "first-network", edit: { codename: "Hola de Nuevo", xp: 50 } }]);
    // its points change the ranking: ana solved it in easy (50) and medium (100)
    expect((await ana.call("GET", "/auth/rankings")).data.me).toMatchObject({ xp: 150 });

    const lab = { version: 4, name: "Empieza", devices: [{ id: "pc", type: "pc", name: "PC", x: 0, y: 0, interfaces: [{ name: "eth0", mac: "02:00:00:00:00:01" }] }], links: [] };
    const custom = { box: "routing", level: 1, codename: "Isla", title: "Una red", story: "Historia.", summary: "Qué hacer.", protocols: ["ipv4"],
      goals: [{ text: "Ping", check: { kind: "ping", from: "pc", to: "10.0.0.1" } }], hints: [], start: lab, solution: lab };
    expect((await admin.call("PUT", "/auth/machines/isla", custom)).data).toMatchObject({ id: "isla", custom: { codename: "Isla" } });
    // a season may use it
    expect((await admin.call("POST", "/auth/seasons", { name: "T2", theme: "x", startsAt: Date.now() - 1000, endsAt: Date.now() + 1e6, machines: ["isla"] })).status).toBe(201);

    // files: only the types it says, as their bytes say, and only for admins
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    const upload = (who: ReturnType<typeof browser>, type: string, body: Buffer) =>
      fetch(base + "/auth/files", { method: "POST", headers: { "Content-Type": type, Cookie: who.cookie() }, body });
    expect((await upload(ana, "image/png", png)).status).toBe(403);
    expect((await upload(admin, "image/svg+xml", png)).status).toBe(415);
    expect((await upload(admin, "image/jpeg", png)).status).toBe(415);
    const made = await (await upload(admin, "image/png", png)).json() as { id: string };
    expect(made).toMatchObject({ mime: "image/png", size: png.length });
    const got = await fetch(`${base}/auth/files/${made.id}`, { headers: { Cookie: ana.cookie() } });
    expect(got.headers.get("content-type")).toBe("image/png");
    expect(got.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await got.arrayBuffer()).equals(png)).toBe(true);
    expect((await admin.call("PUT", "/auth/machines/first-network", { image: "0".repeat(32) })).data).toMatchObject({ detail: "file" });
    expect((await admin.call("PUT", "/auth/machines/first-network", { image: made.id })).status).toBe(200);

    expect((await admin.call("DELETE", "/auth/machines/isla")).status).toBe(204);
    expect((await admin.call("DELETE", "/auth/machines/first-network")).status).toBe(204);
    expect((await ana.call("GET", "/auth/rankings")).data.me).toMatchObject({ xp: 30 });
  });
});
