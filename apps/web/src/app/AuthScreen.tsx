// Before the app: who is using it. A visitor without a session first sees the
// landing page (../landing), and from it the sign-in; sign-up with an invitation (the
// link ?invite=CODE types it in); the first account, the admin, with the setup
// code of the API's log; and a password an admin set, changed before going on.
// The app itself is drawn only for an account signed in.
import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Icon } from "../editor/icons";
import { LANGS, useLang, useT } from "../i18n";
import { useAuth } from "./auth";
import { useStore } from "./store";

const invited = new URLSearchParams(location.search).get("invite") ?? "";
// what a visitor without a session sees first; loaded only for them
const Landing = lazy(() => import("../landing/Landing").then(module => ({ default: module.Landing })));

function Field({ label, hint, ...input }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...input} />
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

/** back to the landing page, from the sign-in and the sign-up */
let toLanding: (() => void) | null = null;

function Card({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  const t = useT();
  const lang = useLang(state => state.lang);
  return (
    <main className="auth">
      <div className="auth-card">
        {toLanding && <button type="button" className="link small auth-back" onClick={toLanding}>← {t("Volver al inicio")}</button>}
        <div className="auth-brand">
          <span className="brand-mark"><Icon name="logo" size={22} /></span>
          <span className="brand-name">visual-tracert</span>
          <select className="auth-lang" aria-label={t("Idioma")} value={lang} onChange={event => useLang.getState().setLang(event.target.value as typeof lang)}>
            {LANGS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        <h1>{title}</h1>
        {lead && <p className="muted">{lead}</p>}
        {children}
      </div>
    </main>
  );
}

/** a form that sends once at a time and shows what went wrong */
function useSubmit(action: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if(busy) return;
    setBusy(true);
    setError(null);
    try{ await action(); }
    catch(failure){ setError((failure as Error).message); }
    finally{ setBusy(false); }
  };
  return { busy, error, setError, submit };
}

const Problem = ({ text }: { text: string | null }) => text ? <p className="auth-error" role="alert">{text}</p> : null;

function SignIn({ toRegister }: { toRegister: () => void }) {
  const t = useT();
  const notice = useAuth(state => state.notice);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, submit } = useSubmit(() => useAuth.getState().login(username.trim(), password));
  return (
    <Card title={t("Inicia sesión")} lead={t("Tu laboratorio de redes: topologías, simulación, emulación con equipos reales y retos.")}>
      {notice && <p className="emu-note small">{notice}</p>}
      <form onSubmit={submit}>
        <Field label={t("Usuario")} autoComplete="username" autoFocus required value={username} onChange={event => setUsername(event.target.value)} />
        <Field label={t("Contraseña")} type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
        <Problem text={error} />
        <button type="submit" className="primary auth-submit" disabled={busy}>{busy ? t("Entrando…") : t("Entrar")}</button>
      </form>
      <p className="auth-switch small muted">{t("¿Tienes una invitación?")} <button type="button" className="link" onClick={toRegister}>{t("Crea tu cuenta")}</button></p>
    </Card>
  );
}

/** name, username and password twice: what every new account asks */
function NewAccount({ extra, submitLabel, onSubmit }: {
  extra?: ReactNode; submitLabel: string;
  onSubmit: (input: { username: string; name: string; password: string }) => Promise<void>;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const { busy, error, setError, submit } = useSubmit(async () => {
    if(password !== again){ setError(t("Las contraseñas no coinciden.")); return; }
    await onSubmit({ username: username.trim(), name: name.trim(), password });
  });
  return (
    <form onSubmit={submit}>
      {extra}
      <Field label={t("Nombre")} autoComplete="name" required maxLength={60} value={name} onChange={event => setName(event.target.value)} />
      <Field label={t("Usuario")} autoComplete="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,31}"
        hint={t("Para iniciar sesión: letras, números, «.», «-» o «_».")} value={username} onChange={event => setUsername(event.target.value)} />
      <Field label={t("Contraseña")} type="password" autoComplete="new-password" required minLength={10} hint={t("Al menos 10 caracteres.")}
        value={password} onChange={event => setPassword(event.target.value)} />
      <Field label={t("Repite la contraseña")} type="password" autoComplete="new-password" required value={again} onChange={event => setAgain(event.target.value)} />
      <Problem text={error} />
      <button type="submit" className="primary auth-submit" disabled={busy}>{busy ? t("Creando…") : submitLabel}</button>
    </form>
  );
}

function Register({ toSignIn }: { toSignIn: () => void }) {
  const t = useT();
  const [invite, setInvite] = useState(invited);
  return (
    <Card title={t("Crea tu cuenta")} lead={t("Necesitas el código de invitación que te dio un administrador o tu profesor.")}>
      <NewAccount submitLabel={t("Crear la cuenta")}
        extra={<Field label={t("Código de invitación")} required autoFocus={!invited} className="mono" placeholder="XXXX-XXXX-XXXX" value={invite}
          onChange={event => setInvite(event.target.value)} />}
        onSubmit={input => useAuth.getState().register({ ...input, invite: invite.trim() })} />
      <p className="auth-switch small muted">{t("¿Ya tienes cuenta?")} <button type="button" className="link" onClick={toSignIn}>{t("Inicia sesión")}</button></p>
    </Card>
  );
}

function Setup() {
  const t = useT();
  const [code, setCode] = useState("");
  return (
    <Card title={t("Crea la cuenta de administrador")}
      lead={<>{t("Es la primera vez que se abre esta instalación. Para que nadie más se adelante, pide el código de instalación que el servicio de cuentas escribe en su registro:")} <code>docker compose logs api</code></>}>
      <NewAccount submitLabel={t("Crear el administrador")}
        extra={<Field label={t("Código de instalación")} required autoFocus className="mono" value={code} onChange={event => setCode(event.target.value)} />}
        onSubmit={input => useAuth.getState().setup({ ...input, code: code.trim() })} />
    </Card>
  );
}

/** a password an admin set: the user picks their own before going on */
export function ChangePasswordForm({ onDone, first = false }: { onDone?: () => void; first?: boolean }) {
  const t = useT();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [done, setDone] = useState(false);
  const { busy, error, setError, submit } = useSubmit(async () => {
    if(next !== again){ setError(t("Las contraseñas no coinciden.")); return; }
    await useAuth.getState().changePassword(current, next);
    setCurrent(""); setNext(""); setAgain(""); setDone(true);
    onDone?.();
  });
  return (
    <form onSubmit={submit} className="auth-form">
      <Field label={first ? t("Contraseña que te dieron") : t("Contraseña actual")} type="password" autoComplete="current-password" required value={current} onChange={event => { setCurrent(event.target.value); setDone(false); }} />
      <Field label={t("Contraseña nueva")} type="password" autoComplete="new-password" required minLength={10} hint={t("Al menos 10 caracteres.")} value={next} onChange={event => setNext(event.target.value)} />
      <Field label={t("Repite la contraseña nueva")} type="password" autoComplete="new-password" required value={again} onChange={event => setAgain(event.target.value)} />
      <Problem text={error} />
      {done && !first && <p className="small ok-text" role="status">{t("Contraseña cambiada. Las demás sesiones se cerraron.")}</p>}
      <button type="submit" className="primary" disabled={busy}>{busy ? t("Guardando…") : t("Cambiar la contraseña")}</button>
    </form>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const t = useT();
  const phase = useAuth(state => state.phase);
  const mustChange = useAuth(state => state.user?.mustChange ?? false);
  const theme = useStore(state => state.theme);
  const [view, setView] = useState<"landing" | "sign-in" | "register">(invited ? "register" : "landing");
  toLanding = phase === "signed-out" ? () => setView("landing") : null;
  useEffect(() => { void useAuth.getState().refresh(); }, []);
  useEffect(() => { document.body.dataset.theme = theme; }, [theme]);
  // signed in from an invitation link: the code goes out of the address
  useEffect(() => { if(phase === "signed-in" && invited) history.replaceState(null, "", location.pathname); }, [phase]);

  if(phase === "loading") return <main className="auth" aria-busy="true" />;
  if(phase === "offline") return (
    <Card title={t("Sin conexión con el servidor")} lead={t("No se puede conectar con el servicio de cuentas. Comprueba que está en marcha (docker compose ps) y vuelve a probar.")}>
      <button type="button" className="primary auth-submit" onClick={() => void useAuth.getState().refresh()}>{t("Reintentar")}</button>
    </Card>
  );
  if(phase === "setup") return <Setup />;
  if(phase === "signed-out"){
    if(view === "landing") return <Suspense fallback={<main className="auth" aria-busy="true" />}><Landing onSignIn={() => setView("sign-in")} onRegister={() => setView("register")} /></Suspense>;
    return view === "register" ? <Register toSignIn={() => setView("sign-in")} /> : <SignIn toRegister={() => setView("register")} />;
  }
  if(mustChange) return (
    <Card title={t("Elige tu contraseña")} lead={t("Un administrador te dio una contraseña provisional: cámbiala por una tuya para seguir.")}>
      <ChangePasswordForm first />
      <p className="auth-switch small muted"><button type="button" className="link" onClick={() => void useAuth.getState().logout()}>{t("Cerrar sesión")}</button></p>
    </Card>
  );
  return <>{children}</>;
}
