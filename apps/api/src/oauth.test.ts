import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "./accounts";
import { openDatabase } from "./db";
import { Practice } from "./practice";
import { startServer } from "./server";

// GitHub and Google, pretended: each code says who signs in
const people: Record<string, { id: string; login: string; name: string; email: string | null }> = {
  "code-ana": { id: "101", login: "Ana.Dev", name: "Ana Pérez", email: "ana@example.com" },
  "code-ana-google": { id: "g-1", login: "ana", name: "Ana P.", email: "ana@example.com" },
  "code-bob": { id: "102", login: "bob", name: "Bob", email: null },
};
const fakeFetch = (async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  const reply = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  if(url === "https://github.com/login/oauth/access_token") return reply({ access_token: `tok:${JSON.parse(String(init!.body)).code}` });
  if(url === "https://oauth2.googleapis.com/token") return reply({ access_token: `tok:${new URLSearchParams(String(init!.body)).get("code")}` });
  const who = people[String((init?.headers as Record<string, string>).Authorization).replace("Bearer tok:", "")];
  if(url === "https://api.github.com/user") return reply({ id: Number(who.id), login: who.login, name: who.name });
  if(url === "https://api.github.com/user/emails") return reply(who.email ? [{ email: who.email, primary: true, verified: true }] : []);
  if(url === "https://openidconnect.googleapis.com/v1/userinfo") return reply({ sub: who.id, email: who.email, email_verified: true, name: who.name });
  return new Response("{}", { status: 404 });
}) as typeof fetch;

let base = "";
let server: ReturnType<typeof startServer>;
beforeAll(async () => {
  const db = openDatabase(":memory:");
  server = startServer(new Accounts(db), new Practice(db), 0, { setupCode: "X", oauth: {
    providers: [{ id: "github", clientId: "gh-id", clientSecret: "gh-secret" }, { id: "google", clientId: "go-id", clientSecret: "go-secret" }],
    publicUrl: "https://visualtracert.online", fetch: fakeFetch,
  } });
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });

/** a browser through the whole flow: to the provider, back with a code */
async function signIn(provider: "github" | "google", code: string, cookie = "", link = false) {
  const start = await fetch(`${base}/auth/oauth/${provider}${link ? "?link=1" : ""}`, { redirect: "manual", headers: cookie ? { Cookie: cookie } : {} });
  expect(start.status).toBe(302);
  const to = new URL(start.headers.get("location")!);
  const state = to.searchParams.get("state")!;
  const flowCookie = start.headers.get("set-cookie")!.split(";")[0];
  const back = await fetch(`${base}/auth/oauth/${provider}/callback?code=${code}&state=${state}`, { headers: { Cookie: [flowCookie, cookie].filter(Boolean).join("; ") } });
  const session = back.headers.getSetCookie().find(item => item.startsWith("vt_session="))?.split(";")[0];
  return { to, back, body: await back.text(), session };
}
const me = async (cookie: string) => (await (await fetch(`${base}/auth/status`, { headers: { Cookie: cookie } })).json()) as { user: { id: number; username: string; hasPassword: boolean } };

describe("signing in with GitHub and Google", () => {
  it("says which are set up, and sends to the provider with its client and the way back", async () => {
    expect(await (await fetch(`${base}/auth/providers`)).json()).toEqual(["github", "google"]);
    const start = await fetch(`${base}/auth/oauth/google`, { redirect: "manual" });
    const to = new URL(start.headers.get("location")!);
    expect(to.origin + to.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(to.searchParams.get("client_id")).toBe("go-id");
    expect(to.searchParams.get("redirect_uri")).toBe("https://visualtracert.online/auth/oauth/google/callback");
    expect(to.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("opens an account for anyone new, and signs the same person in to it again", async () => {
    const first = await signIn("github", "code-ana");
    expect(first.body).toContain('url=/"');
    const status = await me(first.session!);
    expect(status.user).toMatchObject({ username: "ana.dev", name: "Ana Pérez", role: "student", hasPassword: false });
    const again = await signIn("github", "code-ana");
    expect((await me(again.session!)).user.id).toBe(status.user.id);
    // Google with the same verified email: the same account
    const google = await signIn("google", "code-ana-google");
    expect((await me(google.session!)).user.id).toBe(status.user.id);
    const identities = await (await fetch(`${base}/auth/me/identities`, { headers: { Cookie: first.session! } })).json() as { identities: { provider: string }[] };
    expect(identities.identities.map((item: { provider: string }) => item.provider).sort()).toEqual(["github", "google"]);
  });

  it("refuses a way back that is not this browser's flow", async () => {
    const start = await fetch(`${base}/auth/oauth/github`, { redirect: "manual" });
    const state = new URL(start.headers.get("location")!).searchParams.get("state");
    const forged = await fetch(`${base}/auth/oauth/github/callback?code=code-bob&state=${state}`, { headers: { Cookie: "vt_oauth=someone-else" } });
    expect(await forged.text()).toContain("auth_error=oauth-failed");
    expect(forged.headers.getSetCookie().some(item => item.startsWith("vt_session="))).toBe(false);
  });

  it("links a service to the account signed in, and keeps it from losing its only way in", async () => {
    const bob = await signIn("github", "code-bob");
    expect((await me(bob.session!)).user).toMatchObject({ username: "bob", hasPassword: false });
    // GitHub is bob's only way in
    expect((await fetch(`${base}/auth/me/identities/github`, { method: "DELETE", headers: { Cookie: bob.session! } })).status).toBe(409);
    // once he sets a password (no current one needed), he can unlink it
    expect((await fetch(`${base}/auth/me/password`, { method: "POST", headers: { Cookie: bob.session!, "Content-Type": "application/json" }, body: JSON.stringify({ next: "a-new-long-password" }) })).status).toBe(200);
    const status = await me(bob.session!);
    expect(status.user.hasPassword).toBe(true);
  });
});
