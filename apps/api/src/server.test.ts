import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "./accounts";
import { openDatabase } from "./db";
import { hashPassword, verifyPassword } from "./passwords";
import { adminOnly, COOKIE, startServer } from "./server";

const SETUP = "C0DE1234";
let base = "";
let server: ReturnType<typeof startServer>;

beforeAll(async () => {
  server = startServer(new Accounts(openDatabase(":memory:")), 0, { setupCode: SETUP });
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

describe("accounts API", () => {
  const admin = browser();
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
