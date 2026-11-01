// Signing in with another service (OAuth 2.0 authorization code flow): GitHub
// and Google, each on when its client id and secret are set
// (OAUTH_GITHUB_ID/SECRET, OAUTH_GOOGLE_ID/SECRET). The browser goes to the
// provider with a random state (and, Google, a PKCE challenge), kept in a
// short-lived cookie; on its way back the state must match, the code is
// traded for a token on the server, and the person's id and verified email
// are read with it. Nothing of the provider's token is kept.
import { createHash, randomBytes } from "node:crypto";
import type { ProviderProfile } from "./accounts";

export type ProviderId = "github" | "google";

export interface ProviderConfig {
  id: ProviderId;
  clientId: string;
  clientSecret: string;
}

/** the providers set up in the environment */
export function providersFromEnv(env: NodeJS.ProcessEnv = process.env): ProviderConfig[] {
  const list: ProviderConfig[] = [];
  if(env.OAUTH_GITHUB_ID && env.OAUTH_GITHUB_SECRET) list.push({ id: "github", clientId: env.OAUTH_GITHUB_ID, clientSecret: env.OAUTH_GITHUB_SECRET });
  if(env.OAUTH_GOOGLE_ID && env.OAUTH_GOOGLE_SECRET) list.push({ id: "google", clientId: env.OAUTH_GOOGLE_ID, clientSecret: env.OAUTH_GOOGLE_SECRET });
  return list;
}

/** what the flow keeps between going to the provider and coming back (in the cookie) */
export interface Pending {
  provider: ProviderId;
  state: string;
  verifier: string;
  /** the account linking it (signed in when it started), if any */
  link?: number;
  expires: number;
}

export const PENDING_TTL = 10 * 60 * 1000;
const b64url = (buffer: Buffer) => buffer.toString("base64url");

export function startFlow(provider: ProviderConfig, redirectUri: string, now: number, link?: number): { url: string; pending: Pending } {
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const pending: Pending = { provider: provider.id, state, verifier, ...(link !== undefined ? { link } : {}), expires: now + PENDING_TTL };
  const params = provider.id === "github"
    ? new URLSearchParams({ client_id: provider.clientId, redirect_uri: redirectUri, scope: "read:user user:email", state, allow_signup: "true" })
    : new URLSearchParams({ client_id: provider.clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile",
      state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account" });
  const base = provider.id === "github" ? "https://github.com/login/oauth/authorize" : "https://accounts.google.com/o/oauth2/v2/auth";
  return { url: `${base}?${params}`, pending };
}

export class OAuthError extends Error {}

type Fetch = typeof fetch;

async function json(response: Response): Promise<Record<string, unknown>> {
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if(!response.ok || !data) throw new OAuthError(`provider answered ${response.status}`);
  return data;
}

/** the code traded for a token, and the person read with it */
export async function finishFlow(provider: ProviderConfig, code: string, redirectUri: string, pending: Pending, fetchImpl: Fetch = fetch): Promise<ProviderProfile> {
  if(provider.id === "github"){
    const token = await json(await fetchImpl("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: provider.clientId, client_secret: provider.clientSecret, code, redirect_uri: redirectUri }),
    }));
    if(typeof token.access_token !== "string") throw new OAuthError(String(token.error ?? "no token"));
    const headers = { Authorization: `Bearer ${token.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "visual-tracert" };
    const user = await json(await fetchImpl("https://api.github.com/user", { headers }));
    const emails = await fetchImpl("https://api.github.com/user/emails", { headers }).then(json).catch(() => null) as unknown as { email: string; primary: boolean; verified: boolean }[] | null;
    const verified = Array.isArray(emails) ? (emails.find(item => item.primary && item.verified) ?? emails.find(item => item.verified)) : undefined;
    return {
      provider: "github", subject: String(user.id),
      email: verified?.email ?? null,
      login: typeof user.login === "string" ? user.login : null,
      name: typeof user.name === "string" ? user.name : null,
    };
  }
  const token = await json(await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: provider.clientId, client_secret: provider.clientSecret, code, redirect_uri: redirectUri,
      grant_type: "authorization_code", code_verifier: pending.verifier }),
  }));
  if(typeof token.access_token !== "string") throw new OAuthError(String(token.error ?? "no token"));
  const info = await json(await fetchImpl("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } }));
  if(typeof info.sub !== "string") throw new OAuthError("no subject");
  return {
    provider: "google", subject: info.sub,
    email: info.email_verified === true && typeof info.email === "string" ? info.email : null,
    login: typeof info.email === "string" ? info.email.split("@")[0] : null,
    name: typeof info.name === "string" ? info.name : null,
  };
}
