// The user's dashboard: their profile (the account's name; a photo and a few
// words, in this browser; what they have built), their account (password,
// signing out) and, for an admin, the users and invitations; their
// preferences (language, theme, simulation speed, animations), their labs,
// what the server offers (the emulator, its images and profiles) and the
// keyboard shortcuts. A dialog over the workspace, opened from the avatar of
// the top bar.
import { IMAGES, LANGS, parse, type Topology } from "@visual-tracert/model";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadLab, saveLab } from "../app/labs";
import { labVersion, labVersions } from "../app/sync";
import { useAuth } from "../app/auth";
import { squarePhoto, useProfile } from "../app/profile";
import { SPEEDS, THEMES, useStore, type DashboardSection } from "../app/store";
import { Icon } from "../editor/icons";
import { useImages } from "../emulation/images";
import { emulator, type RunningLab } from "../emulation/api";
import { useEmulation } from "../emulation/store";
import { tx, useLang, useT } from "../i18n";
import { useProgress } from "../practice/progress";
import { MachinesSection } from "./MachinesSection";
import { AccountSection, StudentsSection, UsersSection } from "./AccountSections";
import { HelpList } from "./Inspector";
import { Avatar } from "./TopBar";

const SECTIONS: { id: DashboardSection; label: string; icon: string }[] = [
  { id: "profile", label: tx("Perfil"), icon: "user" },
  { id: "account", label: tx("Cuenta"), icon: "key" },
  { id: "users", label: tx("Usuarios"), icon: "users" },
  { id: "machines", label: tx("Máquinas"), icon: "flag" },
  { id: "students", label: tx("Alumnos"), icon: "practice" },
  { id: "preferences", label: tx("Preferencias"), icon: "settings" },
  { id: "labs", label: tx("Laboratorios"), icon: "topology" },
  { id: "server", label: tx("Servidor"), icon: "emulation" },
  { id: "shortcuts", label: tx("Atajos y ayuda"), icon: "keyboard" },
];

const SHORTCUTS: [string[], string][] = [
  [["A"], tx("Añadir un dispositivo")],
  [["V"], tx("Herramienta de selección")],
  [["P"], tx("Herramienta de ping")],
  [["C"], tx("Herramienta de captura")],
  [["F"], tx("Encuadrar el laboratorio")],
  [["L"], tx("Mostrar u ocultar el registro de paquetes")],
  [["Supr"], tx("Eliminar lo seleccionado")],
  [["Ctrl", "Z"], tx("Deshacer")],
  [["Ctrl", "Y"], tx("Rehacer")],
  [["Esc"], tx("Cerrar el inspector, cancelar la herramienta o salir de pantalla completa")],
  [["← / →"], tx("Paso anterior o siguiente de una simulación")],
];

/** what the user has built: their labs, read from this browser */
function useTotals(labs: { id: string }[]) {
  return useMemo(() => {
    const topologies = labs.map(lab => loadLab(lab.id)).filter((item): item is Topology => Boolean(item));
    return {
      byLab: new Map(labs.map((lab, i) => [lab.id, topologies[i]])),
      devices: topologies.reduce((sum, item) => sum + item.devices.length, 0),
      links: topologies.reduce((sum, item) => sum + item.links.length, 0),
    };
  }, [labs]);
}

function ProfileSection() {
  const t = useT();
  const { name, bio } = useProfile();
  const photo = useProfile(state => state.photo);
  const labs = useStore(state => state.labs);
  const profiles = useImages(state => state.profiles);
  const totals = useTotals(labs);
  const solved = Object.keys(useProgress(state => state.done)).length;
  const fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState({ name, bio: bio ?? "" });
  useEffect(() => setDraft({ name, bio: bio ?? "" }), [name, bio]);
  const save = () => {
    const next = draft.name.trim();
    useProfile.getState().update({ bio: draft.bio.trim() });
    // the name is the account's
    if(next && next !== name) useAuth.getState().rename(next).catch(error => { setDraft(value => ({ ...value, name })); useStore.getState().notify((error as Error).message, "error"); });
  };
  return (
    <>
      <div className="dash-profile">
        <Avatar size={88} />
        <div className="dash-profile-photo">
          <button type="button" className="ghost small" onClick={() => fileInput.current?.click()}>
            <Icon name="upload" size={15} />{photo ? t("Cambiar foto") : t("Poner una foto")}
          </button>
          {photo && <button type="button" className="ghost small" onClick={() => useProfile.getState().update({ photo: undefined })}>{t("Quitar")}</button>}
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={async event => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if(!file) return;
            try{ useProfile.getState().update({ photo: await squarePhoto(file) }); }
            catch(error){ useStore.getState().notify((error as Error).message, "error"); }
          }} />
        </div>
      </div>
      <div className="dash-fields">
        <label className="field">
          <span>{t("Nombre")}</span>
          <input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} onBlur={save}
            onKeyDown={event => { if(event.key === "Enter") (event.target as HTMLInputElement).blur(); }} />
        </label>
        <label className="field">
          <span>{t("Sobre ti")}</span>
          <textarea rows={2} value={draft.bio} placeholder={t("Estudiante de redes, profesor, administrador…")}
            onChange={event => setDraft({ ...draft, bio: event.target.value })} onBlur={save} />
        </label>
      </div>
      <div className="dash-stats">
        <div><strong>{labs.length}</strong><span>{t("laboratorios")}</span></div>
        <div><strong>{totals.devices}</strong><span>{t("dispositivos")}</span></div>
        <div><strong>{totals.links}</strong><span>{t("cables")}</span></div>
        <div><strong>{profiles.length}</strong><span>{t("perfiles de imagen")}</span></div>
        <div><strong>{solved}</strong><span>{t("retos superados")}</span></div>
      </div>
      <p className="muted small">{t("Tu nombre es el de tu cuenta. La foto y la descripción viven aún en este navegador.")}</p>
    </>
  );
}

function PreferencesSection() {
  const t = useT();
  const lang = useLang(state => state.lang);
  const theme = useStore(state => state.theme);
  const speed = useStore(state => state.speed);
  const motion = useProfile(state => state.motion ?? "full");
  return (
    <>
      <h3>{t("Idioma")}</h3>
      <div className="dash-choices">
        {LANGS.map(item => (
          <button key={item.id} type="button" className={`dash-choice${lang === item.id ? " active" : ""}`} aria-pressed={lang === item.id}
            onClick={() => useLang.getState().setLang(item.id)}>
            <span className="lang-code">{item.short}</span>{item.label}
          </button>
        ))}
      </div>
      <h3>{t("Tema")}</h3>
      <div className="dash-themes">
        {THEMES.map(item => (
          <button key={item.id} type="button" className={`dash-theme${theme === item.id ? " active" : ""}`} aria-pressed={theme === item.id}
            onClick={() => useStore.getState().setTheme(item.id)}>
            <span className="dash-theme-preview" style={{ background: item.swatch[0] }}>
              <i style={{ background: item.swatch[1] }} /><i style={{ background: item.swatch[2] }} />
            </span>
            {t(item.label)}
          </button>
        ))}
      </div>
      <h3>{t("Simulación")}</h3>
      <label className="field dash-inline">
        <span>{t("Velocidad de reproducción")}</span>
        <select value={String(speed)} onChange={event => {
          const value = event.target.value;
          useStore.getState().setSpeed(value === "realtime" ? "realtime" : Number(value) as never);
        }}>
          {SPEEDS.map(value => <option key={value} value={String(value)}>{value === "realtime" ? t("Tiempo real") : `${value}×`}</option>)}
        </select>
      </label>
      <h3>{t("Animaciones")}</h3>
      <label className="check-row">
        <input type="checkbox" checked={motion === "reduced"} onChange={event => useProfile.getState().update({ motion: event.target.checked ? "reduced" : "full" })} />
        {t("Reducir las animaciones (también se reducen si el sistema lo pide)")}
      </label>
    </>
  );
}

function LabsSection() {
  const t = useT();
  const labs = useStore(state => state.labs);
  const current = useStore(state => state.labId);
  const totals = useTotals(labs);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const locale = LANGS.find(item => item.id === useLang.getState().lang)!.html;
  const date = (time: number) => new Date(time).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  const state = useStore.getState;
  return (
    <>
      <div className="dash-actions">
        <button type="button" className="primary small" onClick={() => { state().createLab("empty"); state().setDashboard(null); }}>
          <Icon name="plus" size={15} />{t("Laboratorio vacío")}
        </button>
        <button type="button" className="ghost small" onClick={() => { state().setDashboard(null); state().setGallery(true); }}>
          <Icon name="logo" size={15} />{t("Desde una plantilla")}
        </button>
      </div>
      <ul className="dash-labs">
        {[...labs].sort((p, q) => q.updatedAt - p.updatedAt).map(lab => {
          const topology = totals.byLab.get(lab.id);
          return (
            <li key={lab.id} className={lab.id === current ? "current" : ""}>
              <div className="dash-lab-text">
                <strong>{lab.name}</strong>
                <span className="muted small">
                  {t("{devices} dispositivos · {links} cables", { devices: topology?.devices.length ?? 0, links: topology?.links.length ?? 0 })} · {date(lab.updatedAt)}
                </span>
              </div>
              {lab.id === current
                ? <span className="tag tag-images">{t("Abierto")}</span>
                : <button type="button" className="ghost small" onClick={() => { state().switchLab(lab.id); state().setDashboard(null); }}>{t("Abrir")}</button>}
              {confirm === lab.id ? (
                <span className="dash-confirm">
                  <button type="button" className="danger" onClick={() => { state().removeLab(lab.id); setConfirm(null); }}>{t("Eliminar")}</button>
                  <button type="button" className="ghost small" onClick={() => setConfirm(null)}>{t("Cancelar")}</button>
                </span>
              ) : (
                <>
                  <button type="button" className="icon-button" aria-expanded={history === lab.id} aria-label={t("Versiones de «{name}»", { name: lab.name })} title={t("Versiones anteriores")}
                    onClick={() => setHistory(history === lab.id ? null : lab.id)}>
                    <Icon name="realtime" size={15} />
                  </button>
                  <button type="button" className="icon-button" aria-label={t("Eliminar «{name}»", { name: lab.name })} title={t("Eliminar")} onClick={() => setConfirm(lab.id)}>
                    <Icon name="trash" size={15} />
                  </button>
                </>
              )}
              {history === lab.id && <LabVersions id={lab.id} date={date} />}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** a lab's earlier versions, kept by the account: one brought back becomes
 * the lab's next change (the open one's can be undone) */
function LabVersions({ id, date }: { id: string; date: (time: number) => string }) {
  const t = useT();
  const [versions, setVersions] = useState<{ savedAt: number; name: string; size: number }[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { labVersions(id).then(setVersions).catch(() => setFailed(true)); }, [id]);
  const restore = async (savedAt: number) => {
    try{
      const topology = parse((await labVersion(id, savedAt)).document, "json").topology;
      if(!topology) throw new Error(t("Esa versión no se pudo leer."));
      const store = useStore.getState();
      if(store.labId === id) store.commit(topology);
      else useStore.setState({ labs: saveLab(id, topology) });
      store.notify(t("Versión del {date} recuperada.", { date: date(savedAt) }), "ok");
    }catch(error){ useStore.getState().notify((error as Error).message, "error"); }
  };
  return (
    <div className="lab-versions">
      {failed ? <p className="muted small">{t("Este laboratorio aún no está guardado en tu cuenta.")}</p>
        : !versions ? <p className="muted small">{t("Cargando…")}</p>
        : !versions.length ? <p className="muted small">{t("Aún no hay versiones anteriores: se guarda una cada diez minutos de cambios, hasta diez.")}</p>
        : <ul>{versions.map(version => (
            <li key={version.savedAt}>
              <span className="small">{date(version.savedAt)} · <span className="muted">{version.name}</span></span>
              <button type="button" className="ghost small" onClick={() => void restore(version.savedAt)}>{t("Recuperar")}</button>
            </li>
          ))}</ul>}
    </div>
  );
}

/** the labs with containers on the server: the user's (an admin: everyone's),
 * whose and since when, each one stopped from here */
function RunningLabs() {
  const t = useT();
  const role = useAuth(state => state.user?.role);
  const quota = useEmulation(state => state.health?.quota);
  const names = useStore(state => state.labs);
  const [labs, setLabs] = useState<RunningLab[] | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);
  const load = () => { emulator.labs().then(setLabs).catch(() => setLabs([])); };
  useEffect(load, []);
  const admin = role === "admin";
  const stop = async (lab: string) => {
    setStopping(lab);
    try{
      await emulator.stop(lab);
      if(lab === useStore.getState().labId) void useEmulation.getState().refresh(lab);
    }catch(error){ useStore.getState().notify((error as Error).message, "error"); }
    setStopping(null);
    load();
  };
  return (
    <>
      <h3>{admin ? t("Laboratorios encendidos en el servidor ({n})", { n: labs?.length ?? 0 }) : t("Tus laboratorios encendidos ({n})", { n: labs?.length ?? 0 })}</h3>
      {quota && !admin && (
        <p className="muted small">{t("Puedes tener hasta {labs} laboratorios y {containers} equipos encendidos a la vez. Usas {used} equipos.", { labs: quota.labs, containers: quota.containers, used: labs?.reduce((sum, lab) => sum + lab.containers, 0) ?? 0 })}</p>
      )}
      {labs === null ? <p className="muted small">{t("Cargando…")}</p> : labs.length === 0 ? <p className="muted small">{t("Ningún laboratorio encendido.")}</p> : (
        <ul className="dash-labs">
          {labs.map(lab => (
            <li key={lab.lab} className={lab.lab === useStore.getState().labId ? "current" : ""}>
              <div className="dash-lab-text">
                <strong>{names.find(item => item.id === lab.lab)?.name ?? lab.lab}</strong>
                <span className="muted small">
                  {admin && lab.owner && <>{lab.owner.name} · </>}
                  {t("{n} equipos", { n: lab.containers })} · {t("desde hace {time}", { time: span(Date.now() - lab.since) })}
                  {lab.expires && <> · {t("caduca en {time}", { time: span(lab.expires - Date.now()) })}</>}
                </span>
              </div>
              <button type="button" className="ghost small" disabled={stopping === lab.lab} onClick={() => void stop(lab.lab)}>
                <Icon name="stop" size={14} />{stopping === lab.lab ? t("Deteniendo…") : t("Detener")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** "5 min", "2 h": a length of time */
function span(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}

function ServerSection() {
  const t = useT();
  const health = useEmulation(state => state.health);
  const reachable = useEmulation(state => state.reachable);
  const images = useImages(state => state.images);
  const profiles = useImages(state => state.profiles);
  useEffect(() => { void useEmulation.getState().checkHealth(); void useImages.getState().refresh(); }, []);
  const here = Object.values(IMAGES).filter(image => image.builtin || images[image.id]?.pulled);
  const rows: [string, string][] = [
    [t("Emulador"), reachable === false || !health ? t("sin conexión") : `${health.version} · ${health.docker ? t("Docker conectado") : t("Docker sin conexión")}`],
    [t("Máquinas virtuales"), health?.kvm === undefined ? "…" : health.kvm ? t("con KVM (velocidad casi nativa)") : t("sin KVM (emuladas, lentas)")],
    [t("Contenedores privilegiados"), health?.privileged === undefined ? "…" : health.privileged ? t("permitidos") : t("no permitidos")],
  ];
  return (
    <>
      <dl className="emu-info">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <RunningLabs />
      <h3>{t("Imágenes en este servidor ({n})", { n: here.length })}</h3>
      <ul className="dash-images">
        {here.map(image => (
          <li key={image.id}>
            <span className="props-icon market-logo"><Icon name={image.id} size={20} /></span>
            <div className="dash-lab-text"><strong>{image.name}</strong><span className="mono muted small">{image.ref}</span></div>
          </li>
        ))}
      </ul>
      <h3>{t("Perfiles de imagen ({n})", { n: profiles.length })}</h3>
      {profiles.length
        ? <ul className="dash-images">{profiles.map(item => (
            <li key={item.profile.id}>
              <span className="props-icon market-logo"><Icon name={item.profile.base} size={20} /></span>
              <div className="dash-lab-text"><strong>{item.profile.name}</strong><span className="mono muted small">{item.profile.id}</span></div>
              <span className={`tag${item.state === "built" ? " tag-images" : ""}`}>{item.state === "built" ? t("Construido") : t("Sin construir")}</span>
            </li>
          ))}</ul>
        : <p className="muted small">{t("Aún no hay perfiles: créalos en el Marketplace.")}</p>}
      <button type="button" className="ghost" onClick={() => { useStore.getState().setDashboard(null); useStore.getState().setMarketplace("images"); }}>
        <Icon name="store" size={16} />{t("Abrir el Marketplace")}
      </button>
    </>
  );
}

function ShortcutsSection() {
  const t = useT();
  return (
    <>
      <table className="dash-keys">
        <tbody>
          {SHORTCUTS.map(([keys, label]) => (
            <tr key={label}>
              <td>{keys.map((key, i) => <span key={key}>{i > 0 && " + "}<kbd>{key}</kbd></span>)}</td>
              <td>{t(label)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>{t("Cómo se usa")}</h3>
      <HelpList />
    </>
  );
}

export function Dashboard() {
  const t = useT();
  const section = useStore(state => state.dashboard);
  const name = useProfile(state => state.name);
  const bio = useProfile(state => state.bio);
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => useStore.getState().setDashboard(null);

  useEffect(() => {
    const element = dialog.current;
    if(!element) return;
    if(section && !element.open) element.showModal();
    if(!section && element.open) element.close();
  }, [section]);

  const role = useAuth(state => state.user?.role);
  // the users: an admin's only; the students' progress: a teacher's or an admin's
  const sections = SECTIONS.filter(item => (item.id !== "users" || role === "admin") && (item.id !== "machines" || role === "admin") && (item.id !== "students" || role === "admin" || role === "teacher"));
  const current = sections.find(item => item.id === section);
  return (
    <dialog ref={dialog} className="gallery dashboard" aria-labelledby="dash-title" onClose={close}
      onClick={event => { if(event.target === dialog.current) close(); }}>
      {current && (
        <div className="dash-inner">
          <nav className="dash-nav" aria-label={t("Panel de usuario")}>
            <div className="dash-user">
              <Avatar size={40} />
              <div className="dash-lab-text"><strong>{name}</strong>{bio && <span className="muted small">{bio}</span>}</div>
            </div>
            {sections.map(item => (
              <button key={item.id} type="button" className={item.id === section ? "active" : ""} aria-current={item.id === section ? "page" : undefined}
                onClick={() => useStore.getState().setDashboard(item.id)}>
                <Icon name={item.icon} size={17} />{t(item.label)}
              </button>
            ))}
            <button type="button" className="dash-logout" onClick={() => { useStore.getState().setDashboard(null); void useAuth.getState().logout(); }}>
              <Icon name="logout" size={17} />{t("Cerrar sesión")}
            </button>
          </nav>
          <section className="dash-main">
            <header className="gallery-head">
              <h2 id="dash-title">{t(current.label)}</h2>
              <button type="button" className="icon-button" aria-label={t("Cerrar")} title={t("Cerrar (Esc)")} onClick={close}><Icon name="close" size={18} /></button>
            </header>
            <div className="dash-body" key={current.id}>
              {current.id === "profile" && <ProfileSection />}
              {current.id === "account" && <AccountSection />}
              {current.id === "users" && <UsersSection />}
              {current.id === "machines" && <MachinesSection />}
              {current.id === "students" && <StudentsSection />}
              {current.id === "preferences" && <PreferencesSection />}
              {current.id === "labs" && <LabsSection />}
              {current.id === "server" && <ServerSection />}
              {current.id === "shortcuts" && <ShortcutsSection />}
            </div>
          </section>
        </div>
      )}
    </dialog>
  );
}
