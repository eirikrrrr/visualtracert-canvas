// The dashboard's sections of the account: the user's own (who they are,
// their password, signing out); for a teacher or an admin, the students'
// progress; and for an admin, everyone's accounts: the users (role, enabled,
// a provisional password, removed) and the invitations to sign up.
import { DIFFICULTY_LABEL, exerciseById, LANGS } from "@visual-tracert/model";
import { useCallback, useEffect, useState } from "react";
import { admin, inviteLink, oauth, ROLE_LABEL, useAuth, type Invite, type Provider, type Role, type User } from "../app/auth";
import { ChangePasswordForm, ProviderButtons } from "../app/AuthScreen";
import { BRANDS } from "../landing/brands";
import { useStore } from "../app/store";
import { syncNow, useSync } from "../app/sync";
import { Icon } from "../editor/icons";
import { useLang, useT } from "../i18n";
import { clock } from "../practice/progress";
import { practiceApi, type StudentProgress } from "../practice/server";

const ROLES: Role[] = ["student", "teacher", "admin"];

function useDate() {
  const lang = useLang(state => state.lang);
  const locale = LANGS.find(item => item.id === lang)!.html;
  return (time: number) => new Date(time).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

export function AccountSection() {
  const t = useT();
  const user = useAuth(state => state.user);
  const date = useDate();
  if(!user) return null;
  const rows: [string, string][] = [
    [t("Usuario"), user.username],
    [t("Rol"), t(ROLE_LABEL[user.role])],
    [t("Cuenta creada"), date(user.createdAt)],
  ];
  return (
    <>
      <dl className="emu-info">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <h3>{user.hasPassword ? t("Cambiar la contraseña") : t("Crear una contraseña")}</h3>
      {!user.hasPassword && <p className="muted small">{t("Entras con GitHub o Google. Si creas una contraseña, también podrás entrar con tu usuario ({username}).", { username: user.username })}</p>}
      <div className="dash-fields"><ChangePasswordForm fresh={!user.hasPassword} /></div>
      <LinkedAccounts />
      <h3>{t("Sesión")}</h3>
      <SyncStatus />
      <button type="button" className="ghost" onClick={() => { useStore.getState().setDashboard(null); void useAuth.getState().logout(); }}>
        <Icon name="logout" size={16} />{t("Cerrar sesión")}
      </button>
    </>
  );
}

/** the services linked to the account (to sign in with them): unlink one, or link another */
function LinkedAccounts() {
  const t = useT();
  const date = useDate();
  const [data, setData] = useState<Awaited<ReturnType<typeof oauth.identities>> | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const load = useCallback(() => { void oauth.identities().then(setData).catch(() => setData(null)); }, []);
  useEffect(() => { load(); void oauth.providers().then(setProviders); }, [load]);
  if(!providers.length && !data?.identities.length) return null;
  const name = (provider: Provider) => provider === "github" ? "GitHub" : "Google";
  return (
    <>
      <h3>{t("Cuentas vinculadas")}</h3>
      <p className="muted small">{t("Entra con un clic con tu cuenta de GitHub o de Google.")}</p>
      {data?.identities.length ? (
        <ul className="dash-images linked-accounts">
          {data.identities.map(identity => (
            <li key={identity.provider}>
              <span className="props-icon market-logo"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d={BRANDS[identity.provider].path} fill="currentColor" /></svg></span>
              <div className="dash-lab-text"><strong>{name(identity.provider)}</strong><span className="muted small">{identity.email ?? "—"} · {t("desde {date}", { date: date(identity.createdAt) })}</span></div>
              <button type="button" className="ghost small" onClick={async () => {
                try{ await oauth.unlink(identity.provider); load(); useStore.getState().notify(t("{service} desvinculado.", { service: name(identity.provider) }), "ok"); }
                catch(error){ useStore.getState().notify((error as Error).message, "error"); }
              }}>{t("Desvincular")}</button>
            </li>
          ))}
        </ul>
      ) : null}
      <ProviderButtons link linked={data?.identities.map(item => item.provider) ?? []} />
    </>
  );
}

/** where the account's copy of this browser's labs and settings stands */
function SyncStatus() {
  const t = useT();
  const sync = useSync();
  const date = useDate();
  const text = sync.status === "syncing" ? t("Guardando en tu cuenta…")
    : sync.status === "error" ? t("No se pudo guardar en tu cuenta: {message}. Se reintentará con el próximo cambio.", { message: sync.message ?? "" })
    : sync.at ? t("Tus laboratorios, tu perfil, tus preferencias y tu progreso se guardan en tu cuenta. Última sincronización: {date}.", { date: date(sync.at) })
    : t("Tus laboratorios, tu perfil, tus preferencias y tu progreso se guardan en tu cuenta.");
  return (
    <div className="sync-status">
      <span className={`sync-dot ${sync.status}`} aria-hidden="true" />
      <p className="small">{text}</p>
      <button type="button" className="ghost small" disabled={sync.status === "syncing"} onClick={syncNow}><Icon name="restart" size={14} />{t("Sincronizar ahora")}</button>
    </div>
  );
}

/** "K7QF-…": copied to the clipboard, saying so for a moment */
function CopyButton({ text, label }: { text: string; label: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="ghost small" onClick={async () => {
      try{ await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1400); }
      catch(_){ useStore.getState().notify(t("No se pudo copiar al portapapeles."), "error"); }
    }}><Icon name={copied ? "check" : "copy"} size={14} />{copied ? t("Copiado") : label}</button>
  );
}

function UserRow({ user, me, reload }: { user: User; me: number; reload: () => void }) {
  const t = useT();
  const date = useDate();
  const [mode, setMode] = useState<"idle" | "password" | "delete">("idle");
  const [password, setPassword] = useState("");
  const run = async (action: () => Promise<unknown>, done?: string) => {
    try{ await action(); if(done) useStore.getState().notify(done, "ok"); setMode("idle"); setPassword(""); reload(); }
    catch(error){ useStore.getState().notify((error as Error).message, "error"); }
  };
  const self = user.id === me;
  return (
    <li className={user.disabled ? "disabled" : ""}>
      <div className="dash-lab-text">
        <strong>{user.name}{self && <span className="muted"> · {t("tú")}</span>}</strong>
        <span className="muted small">
          <span className="mono">{user.username}</span> · {user.lastLogin ? t("última entrada {date}", { date: date(user.lastLogin) }) : t("nunca ha entrado")}
          {user.mustChange && <> · {t("contraseña provisional")}</>}
        </span>
      </div>
      {user.disabled && <span className="tag">{t("Desactivada")}</span>}
      <select aria-label={t("Rol de {name}", { name: user.name })} value={user.role} disabled={self}
        onChange={event => void run(() => admin.updateUser(user.id, { role: event.target.value as Role }))}>
        {ROLES.map(role => <option key={role} value={role}>{t(ROLE_LABEL[role])}</option>)}
      </select>
      {mode === "password" ? (
        <form className="dash-confirm" onSubmit={event => { event.preventDefault(); void run(() => admin.resetPassword(user.id, password), t("Contraseña provisional puesta: dásela a {name}.", { name: user.name })); }}>
          <input type="text" className="mono" required minLength={10} placeholder={t("Contraseña provisional")} aria-label={t("Contraseña provisional")}
            value={password} onChange={event => setPassword(event.target.value)} autoFocus />
          <button type="submit" className="primary small">{t("Poner")}</button>
          <button type="button" className="ghost small" onClick={() => setMode("idle")}>{t("Cancelar")}</button>
        </form>
      ) : mode === "delete" ? (
        <span className="dash-confirm">
          <button type="button" className="danger" onClick={() => void run(() => admin.deleteUser(user.id), t("Cuenta eliminada."))}>{t("Eliminar")}</button>
          <button type="button" className="ghost small" onClick={() => setMode("idle")}>{t("Cancelar")}</button>
        </span>
      ) : !self && (
        <span className="dash-confirm">
          <button type="button" className="icon-button" title={t("Poner una contraseña provisional")} aria-label={t("Poner una contraseña provisional a {name}", { name: user.name })}
            onClick={() => setMode("password")}><Icon name="key" size={15} /></button>
          <button type="button" className="ghost small" onClick={() => void run(() => admin.updateUser(user.id, { disabled: !user.disabled }))}>
            {user.disabled ? t("Activar") : t("Desactivar")}
          </button>
          <button type="button" className="icon-button" title={t("Eliminar")} aria-label={t("Eliminar la cuenta de {name}", { name: user.name })}
            onClick={() => setMode("delete")}><Icon name="trash" size={15} /></button>
        </span>
      )}
    </li>
  );
}

function InviteForm({ created }: { created: (invite: Invite) => void }) {
  const t = useT();
  const [role, setRole] = useState<Role>("student");
  const [uses, setUses] = useState(1);
  const [days, setDays] = useState(7);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form className="dash-invite-form" onSubmit={async event => {
      event.preventDefault();
      setBusy(true);
      try{ created(await admin.createInvite({ role, uses, days, note: note.trim() || undefined })); setNote(""); }
      catch(error){ useStore.getState().notify((error as Error).message, "error"); }
      finally{ setBusy(false); }
    }}>
      <label className="field"><span>{t("Rol")}</span>
        <select value={role} onChange={event => setRole(event.target.value as Role)}>{ROLES.map(item => <option key={item} value={item}>{t(ROLE_LABEL[item])}</option>)}</select>
      </label>
      <label className="field"><span>{t("Usos")}</span>
        <input type="number" min={1} max={500} value={uses} onChange={event => setUses(Number(event.target.value))} />
      </label>
      <label className="field"><span>{t("Caduca en (días)")}</span>
        <input type="number" min={0} max={365} value={days} title={t("0: no caduca")} onChange={event => setDays(Number(event.target.value))} />
      </label>
      <label className="field dash-invite-note"><span>{t("Nota (para ti)")}</span>
        <input maxLength={80} placeholder={t("Aula 3, curso de CCNA…")} value={note} onChange={event => setNote(event.target.value)} />
      </label>
      <button type="submit" className="primary small" disabled={busy}><Icon name="plus" size={15} />{t("Crear invitación")}</button>
    </form>
  );
}

export function UsersSection() {
  const t = useT();
  const me = useAuth(state => state.user?.id ?? 0);
  const date = useDate();
  const [users, setUsers] = useState<User[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const reload = useCallback(() => {
    admin.users().then(setUsers).catch(error => useStore.getState().notify((error as Error).message, "error"));
    admin.invites().then(setInvites).catch(() => undefined);
  }, []);
  useEffect(reload, [reload]);
  return (
    <>
      <h3>{t("Invitaciones")}</h3>
      <p className="muted small">{t("Para crear una cuenta hace falta una invitación. Su rol será el de la cuenta; compártela con su enlace o su código.")}</p>
      <InviteForm created={invite => { setFresh(invite.code); reload(); }} />
      {invites.length > 0 && (
        <ul className="dash-labs dash-invites">
          {invites.map(invite => (
            <li key={invite.code} className={invite.code === fresh ? "current" : ""}>
              <div className="dash-lab-text">
                <strong className="mono">{invite.code}</strong>
                <span className="muted small">
                  {t(ROLE_LABEL[invite.role])} · {t("usos restantes: {n}", { n: invite.usesLeft })} · {invite.expiresAt ? t("caduca {date}", { date: date(invite.expiresAt) }) : t("no caduca")}
                  {invite.note && <> · {invite.note}</>}
                </span>
              </div>
              <CopyButton text={inviteLink(invite.code)} label={t("Copiar enlace")} />
              <CopyButton text={invite.code} label={t("Copiar código")} />
              <button type="button" className="icon-button" title={t("Anular")} aria-label={t("Anular la invitación {code}", { code: invite.code })}
                onClick={() => admin.deleteInvite(invite.code).then(reload).catch(error => useStore.getState().notify((error as Error).message, "error"))}>
                <Icon name="trash" size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3>{t("Usuarios ({n})", { n: users?.length ?? 0 })}</h3>
      {users === null ? <p className="muted small">{t("Cargando…")}</p> : (
        <ul className="dash-labs dash-users">
          {users.map(user => <UserRow key={user.id} user={user} me={me} reload={reload} />)}
        </ul>
      )}
    </>
  );
}

/** everyone's progress, for a teacher: XP, machines solved (which, how, how fast) */
export function StudentsSection() {
  const t = useT();
  const date = useDate();
  const [list, setList] = useState<StudentProgress[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => { practiceApi.progress().then(setList).catch(error => { useStore.getState().notify((error as Error).message, "error"); setList([]); }); }, []);
  const words = query.trim().toLowerCase();
  const shown = (list ?? []).filter(user => !words || `${user.name} ${user.username}`.toLowerCase().includes(words)).sort((p, q) => q.xp - p.xp);
  return (
    <>
      <p className="muted small">{t("El progreso de cada cuenta en Practicar. «Verificada»: superada en Medio y comprobada por el servidor en los equipos reales.")}</p>
      <label className="machine-search dash-search">
        <Icon name="search" size={16} />
        <input type="search" value={query} placeholder={t("Buscar por nombre o usuario…")} aria-label={t("Buscar")} onChange={event => setQuery(event.target.value)} />
      </label>
      {list === null ? <p className="muted small">{t("Cargando…")}</p> : (
        <ul className="dash-labs dash-students">
          {shown.map(user => {
            const last = Math.max(0, ...user.solves.map(solve => solve.solvedAt));
            return (
              <li key={user.id} className={open === user.id ? "current" : ""}>
                <button type="button" className="dash-student-head" aria-expanded={open === user.id} onClick={() => setOpen(open === user.id ? null : user.id)}>
                  <div className="dash-lab-text">
                    <strong>{user.name}</strong>
                    <span className="muted small"><span className="mono">{user.username}</span> · {t(ROLE_LABEL[user.role])}{last ? ` · ${t("última entrada {date}", { date: date(last) })}` : ""}</span>
                  </div>
                  <span className="mono small xp-cell">{user.xp} XP</span>
                  <span className="tag">{t("{n} máquinas", { n: user.solves.length })}</span>
                  <Icon name="chevron" size={15} />
                </button>
                {open === user.id && (user.solves.length ? (
                  <table className="dash-keys dash-solves">
                    <tbody>
                      {user.solves.map(solve => {
                        const exercise = exerciseById(solve.exercise);
                        return (
                          <tr key={`${solve.exercise}:${solve.difficulty}`}>
                            <td><strong>{exercise ? t(exercise.codename) : solve.exercise}</strong> <span className="muted small">{exercise ? t(exercise.title) : ""}</span></td>
                            <td>{t(DIFFICULTY_LABEL[solve.difficulty])}{solve.verified && <> · <span className="solved-cell"><Icon name="check" size={12} />{t("Verificada")}</span></>}</td>
                            <td className="mono small">{solve.timeMs ? clock(solve.timeMs) : "—"}</td>
                            <td className="muted small">{date(solve.solvedAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : <p className="muted small">{t("Aún no ha superado ninguna máquina.")}</p>)}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
