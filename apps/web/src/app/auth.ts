// The account signed in, and the accounts API (apps/api, at /auth): sign-in,
// sign-up with an invitation, the first account (the admin) and, for an
// admin, the users and invitations. The session is an HttpOnly cookie: this
// page never sees it; it asks /auth/status who it is. The emulator answers
// 401 once the session is over: back to the sign-in.
import { create } from "zustand";
import { t, tx, useLang } from "../i18n";
import { useProfile } from "./profile";

export type Role = "student" | "teacher" | "admin";

export interface User {
  id: number;
  username: string;
  name: string;
  role: Role;
  disabled: boolean;
  mustChange: boolean;
  createdAt: number;
  lastLogin: number | null;
  /** it has a password (an account made with GitHub or Google may not, until it sets one) */
  hasPassword: boolean;
}

export type Provider = "github" | "google";

export interface Invite {
  code: string;
  role: Role;
  usesLeft: number;
  expiresAt: number | null;
  note: string | null;
  createdBy: string | null;
  createdAt: number;
}

export const ROLE_LABEL: Record<Role, string> = { student: tx("Alumno"), teacher: tx("Profesor"), admin: tx("Administrador") };

/** what each error code of the API means, in the user's words */
const MESSAGES: Record<string, string> = {
  "bad-request": tx("La petición no es válida."),
  "bad-username": tx("El usuario debe tener de 3 a 32 letras, números, puntos, guiones o guiones bajos, y empezar por una letra o un número."),
  "bad-name": tx("Escribe tu nombre (hasta 60 caracteres)."),
  "bad-password": tx("La contraseña debe tener al menos 10 caracteres."),
  "username-taken": tx("Ese usuario ya existe: elige otro."),
  "already-set-up": tx("Ya hay una cuenta de administrador: inicia sesión."),
  "invalid-setup-code": tx("El código de instalación no es correcto. Está en el registro del servicio: docker compose logs api"),
  "invalid-invite": tx("La invitación no es válida, caducó o ya se usó."),
  "invalid-credentials": tx("Usuario o contraseña incorrectos."),
  "disabled": tx("Esta cuenta está desactivada. Habla con un administrador."),
  "too-many-attempts": tx("Demasiados intentos. Espera unos minutos y vuelve a probar."),
  "wrong-password": tx("La contraseña actual no es correcta."),
  "not-found": tx("No existe."),
  "last-admin": tx("Debe quedar al menos un administrador activo."),
  "unauthorized": tx("Tu sesión terminó: vuelve a iniciar sesión."),
  "forbidden": tx("No tienes permiso para hacer esto."),
  "emulator-unavailable": tx("No se puede conectar con el emulador."),
  "bad-machine": tx("Revisa los datos de la máquina."),
  "identity-taken": tx("Esa cuenta ya está vinculada a otro usuario de visual-tracert."),
  "last-sign-in": tx("Es tu única forma de entrar: crea antes una contraseña o vincula otra cuenta."),
  "oauth-failed": tx("No se pudo completar el inicio de sesión con ese servicio. Vuelve a probar."),
  "oauth-unavailable": tx("Ese servicio no está disponible en este servidor."),
  "bad-file": tx("Solo se admiten imágenes PNG, JPEG o WebP, y documentos PDF."),
  "too-large": tx("El archivo es demasiado grande: las imágenes, hasta 2 MB; los PDF, hasta 10 MB."),
};

/** a machine's field the server refused (bad-machine), named for the user */
const MACHINE_FIELD: Record<string, string> = {
  id: tx("el identificador (de 3 a 40 minúsculas, números o guiones)"), codename: tx("el nombre"), title: tx("el título"),
  story: tx("la historia"), summary: tx("el resumen"), level: tx("el nivel"), xp: tx("los puntos (de 0 a 1000)"),
  image: tx("la imagen"), pdf: tx("el PDF"), file: tx("el archivo (súbelo de nuevo)"), protocols: tx("los protocolos"),
  box: tx("el tema"), goals: tx("los objetivos (cada uno con su texto y un equipo del laboratorio)"), hints: tx("las pistas"),
  cli: tx("los pasos de CLI"), start: tx("el laboratorio de partida"), solution: tx("el laboratorio resuelto"),
};

export class AuthError extends Error {
  /** message: the server's own words (the emulator's, already in the user's language) */
  constructor(readonly code: string, message?: string) {
    super(message ?? (MESSAGES[code] ? t(MESSAGES[code]) : t("El servicio de cuentas no está disponible ({status}).", { status: code })));
  }
}

export async function authCall<R>(method: string, path: string, body?: unknown): Promise<R> {
  let res: Response;
  try{
    res = await fetch(`/auth${path}`, {
      method,
      credentials: "same-origin",
      headers: { "Accept-Language": useLang.getState().lang, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }catch(_){
    throw new Error(t("No se puede conectar con el servicio de cuentas."));
  }
  const text = await res.text();
  const data = text ? (() => { try{ return JSON.parse(text); }catch(_){ return null; } })() : null;
  if(!res.ok){
    if(res.status === 401 && path !== "/login") useAuth.getState().expired();
    const field = data?.error === "bad-machine" && typeof data.detail === "string" ? MACHINE_FIELD[data.detail] : undefined;
    throw new AuthError(data?.error ?? String(res.status), typeof data?.message === "string" ? data.message : field ? t("Revisa {field}.", { field: t(field) }) : undefined);
  }
  return data as R;
}

type Phase = "loading" | "offline" | "setup" | "signed-out" | "signed-in";

interface AuthState {
  phase: Phase;
  user: User | null;
  /** why it is signed out (the session ended) */
  notice: string | null;
  refresh: () => Promise<void>;
  setup: (input: { code: string; username: string; name: string; password: string }) => Promise<void>;
  register: (input: { invite: string; username: string; name: string; password: string }) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** the session ended (an answer 401): back to the sign-in */
  expired: () => void;
  rename: (name: string) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => {
  const signedIn = (user: User) => {
    set({ phase: "signed-in", user, notice: null });
    // the name on the avatar is the account's
    if(useProfile.getState().name !== user.name) useProfile.getState().update({ name: user.name });
  };
  return {
    phase: "loading",
    user: null,
    notice: null,
    refresh: async () => {
      try{
        const status = await authCall<{ setup: boolean; user: User | null }>("GET", "/status");
        if(status.user) signedIn(status.user);
        else set({ phase: status.setup ? "setup" : "signed-out", user: null });
      }catch(_){
        set({ phase: "offline", user: null });
      }
    },
    setup: async input => signedIn((await authCall<{ user: User }>("POST", "/setup", input)).user),
    register: async input => signedIn((await authCall<{ user: User }>("POST", "/register", input)).user),
    login: async (username, password) => signedIn((await authCall<{ user: User }>("POST", "/login", { username, password })).user),
    logout: async () => {
      await authCall("POST", "/logout", {}).catch(() => undefined);
      set({ phase: "signed-out", user: null, notice: null });
    },
    expired: () => {
      if(get().phase === "signed-in") set({ phase: "signed-out", user: null, notice: t("Tu sesión terminó: vuelve a iniciar sesión.") });
    },
    rename: async name => signedIn((await authCall<{ user: User }>("PATCH", "/me", { name })).user),
    changePassword: async (current, next) => signedIn((await authCall<{ user: User }>("POST", "/me/password", { current, next })).user),
  };
});

// --- administration ------------------------------------------------------------

/** signing in with GitHub and Google: the services set up, and those linked to the account */
let providersOnce: Promise<Provider[]> | null = null;
export const oauth = {
  providers: () => (providersOnce ??= authCall<Provider[]>("GET", "/providers").catch(() => { providersOnce = null; return []; })),
  identities: () => authCall<{ hasPassword: boolean; identities: { provider: Provider; email: string | null; createdAt: number }[] }>("GET", "/me/identities"),
  unlink: (provider: Provider) => authCall<void>("DELETE", `/me/identities/${provider}`),
  /** where the browser goes to sign in (or, linking: to link it to this account) */
  url: (provider: Provider, link = false) => `/auth/oauth/${provider}${link ? "?link=1" : ""}`,
};

/** what the way back from a provider said (?auth_error=…, ?linked=…), read once */
export const oauthResult = (() => {
  const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
  const result = { error: params.get("auth_error"), linked: params.get("linked") as Provider | null };
  if((result.error || result.linked) && typeof history !== "undefined"){
    params.delete("auth_error"); params.delete("linked");
    history.replaceState(null, "", location.pathname + (params.size ? `?${params}` : ""));
  }
  return result;
})();
export const errorMessage = (code: string) => new AuthError(code).message;

export const admin = {
  users: () => authCall<User[]>("GET", "/users"),
  updateUser: (id: number, change: { role?: Role; disabled?: boolean }) => authCall<{ user: User }>("PATCH", `/users/${id}`, change),
  resetPassword: (id: number, password: string) => authCall<{ user: User }>("POST", `/users/${id}/password`, { password }),
  deleteUser: (id: number) => authCall<void>("DELETE", `/users/${id}`),
  invites: () => authCall<Invite[]>("GET", "/invites"),
  createInvite: (input: { role: Role; uses: number; days: number; note?: string }) => authCall<Invite>("POST", "/invites", input),
  deleteInvite: (code: string) => authCall<void>("DELETE", `/invites/${code}`),
};

/** the link that opens the sign-up with an invitation already typed */
export const inviteLink = (code: string) => `${location.origin}/?invite=${encodeURIComponent(code)}`;
