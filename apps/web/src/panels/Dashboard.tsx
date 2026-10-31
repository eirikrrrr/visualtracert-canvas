// The user's dashboard: their local profile (name, photo, a few words, what
// they have built), their preferences (language, theme, simulation speed,
// animations), their labs, what the server offers (the emulator, its images
// and profiles) and the keyboard shortcuts. A dialog over the workspace,
// opened from the avatar of the top bar. Everything in it lives in this
// browser, except what the server says.
import { IMAGES, LANGS, type Topology } from "@visual-tracert/model";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadLab } from "../app/labs";
import { squarePhoto, useProfile } from "../app/profile";
import { SPEEDS, THEMES, useStore, type DashboardSection } from "../app/store";
import { Icon } from "../editor/icons";
import { useImages } from "../emulation/images";
import { useEmulation } from "../emulation/store";
import { tx, useLang, useT } from "../i18n";
import { useProgress } from "../practice/progress";
import { HelpList } from "./Inspector";
import { Avatar } from "./TopBar";

const SECTIONS: { id: DashboardSection; label: string; icon: string }[] = [
  { id: "profile", label: tx("Perfil"), icon: "user" },
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
    useProfile.getState().update({ name: next || name, bio: draft.bio.trim() });
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
      <p className="muted small">{t("Este perfil vive en este navegador: todavía no hay cuentas de usuario.")}</p>
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
                <button type="button" className="icon-button" aria-label={t("Eliminar «{name}»", { name: lab.name })} title={t("Eliminar")} onClick={() => setConfirm(lab.id)}>
                  <Icon name="trash" size={15} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
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

  const current = SECTIONS.find(item => item.id === section);
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
            {SECTIONS.map(item => (
              <button key={item.id} type="button" className={item.id === section ? "active" : ""} aria-current={item.id === section ? "page" : undefined}
                onClick={() => useStore.getState().setDashboard(item.id)}>
                <Icon name={item.icon} size={17} />{t(item.label)}
              </button>
            ))}
          </nav>
          <section className="dash-main">
            <header className="gallery-head">
              <h2 id="dash-title">{t(current.label)}</h2>
              <button type="button" className="icon-button" aria-label={t("Cerrar")} title={t("Cerrar (Esc)")} onClick={close}><Icon name="close" size={18} /></button>
            </header>
            <div className="dash-body" key={current.id}>
              {current.id === "profile" && <ProfileSection />}
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
