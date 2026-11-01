// Top bar: the mode, the lab being edited (its name, its details in the
// inspector and the menu of labs: switch, new, from a template, duplicate,
// delete), the language, the theme and the avatar, which opens the user's
// dashboard.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LabMeta } from "../app/labs";
import { initials, useProfile } from "../app/profile";
import { chooseMode, useProgress } from "../practice/progress";
import { THEMES, useStore, type Mode } from "../app/store";
import { Icon } from "../editor/icons";
import { LANGS, tx, useLang, useT, type T } from "../i18n";

const MODES: { id: Mode; label: string; title: string }[] = [
  { id: "practice", label: tx("Practicar"), title: tx("Retos por temas para poner a prueba lo que sabes, con su comprobación") },
  { id: "emulation", label: tx("Emulación"), title: tx("Cada equipo es un contenedor real y cada cable, un enlace virtual: los comandos se ejecutan de verdad") },
  { id: "simulation", label: tx("Simulación"), title: tx("La red se simula aquí: cada acción se ve trama a trama sobre el lienzo") },
];

function ago(time: number, t: T, locale: string): string {
  const minutes = Math.round((Date.now() - time) / 60000);
  if(minutes < 1) return t("ahora");
  if(minutes < 60) return t("hace {n} min", { n: minutes });
  const hours = Math.round(minutes / 60);
  if(hours < 24) return t("hace {n} h", { n: hours });
  return new Date(time).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

/** A button that opens a menu below it; closes with Escape or a click outside. */
function Dropdown({ className, label, title, button, children, align = "end" }: {
  className?: string; label: string; title: string; button: ReactNode; align?: "start" | "end";
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if(!open) return;
    const outside = (event: PointerEvent) => { if(!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if(event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    root.current?.querySelector<HTMLElement>(".menu [aria-checked=\"true\"], .menu button, .menu input")?.focus();
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return (
    <div className={`dropdown ${className ?? ""}`} ref={root}>
      <button type="button" className="dropdown-button" aria-haspopup="true" aria-expanded={open} aria-label={label} title={title}
        onClick={() => setOpen(!open)}>{button}</button>
      {open && <div className={`menu menu-${align}`} role="menu" aria-label={label}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

/** a lab of the menu: open it, or (its bin) delete it, confirmed in place */
function LabRow({ lab, current, exercise, close }: { lab: LabMeta; current: boolean; exercise?: string; close: () => void }) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const locale = LANGS.find(item => item.id === useLang.getState().lang)!.html;
  if(confirming){
    return (
      <div className="lab-row confirming" role="group" aria-label={t("¿Eliminar «{name}»?", { name: lab.name })}>
        <span className="menu-text"><span>{t("¿Eliminar «{name}»?", { name: lab.name })}</span><small>{t("No se puede deshacer.")}</small></span>
        <button type="button" className="ghost small" onClick={() => setConfirming(false)}>{t("No")}</button>
        <button type="button" className="danger small" onClick={() => { useStore.getState().removeLab(lab.id); setConfirming(false); }}>{t("Eliminar")}</button>
      </div>
    );
  }
  return (
    <div className={`lab-row${current ? " current" : ""}`}>
      <button type="button" role="menuitemradio" aria-checked={current} onClick={() => { useStore.getState().switchLab(lab.id); close(); }}>
        <Icon name={exercise ? "practice" : "file"} size={16} />
        <span className="menu-text"><span>{lab.name}</span><small>{exercise ? t("Reto · {when}", { when: ago(lab.updatedAt, t, locale) }) : ago(lab.updatedAt, t, locale)}</small></span>
        {current && <span className="check" aria-hidden="true">✓</span>}
      </button>
      <button type="button" className="icon-button lab-row-delete" aria-label={t("Eliminar «{name}»", { name: lab.name })} title={t("Eliminar")}
        onClick={() => setConfirming(true)}>
        <Icon name="trash" size={15} />
      </button>
    </div>
  );
}

function LabMenu() {
  const labs = useStore(state => state.labs);
  const labId = useStore(state => state.labId);
  const attempts = useProgress(state => state.labs);
  const [query, setQuery] = useState("");
  const store = useStore.getState;
  const t = useT();
  const words = query.trim().toLowerCase();
  const shown = [...labs].sort((p, q) => q.updatedAt - p.updatedAt).filter(lab => !words || lab.name.toLowerCase().includes(words));
  const exercises = shown.filter(lab => attempts[lab.id]);
  const own = shown.filter(lab => !attempts[lab.id]);
  return (
    <Dropdown className="lab-menu" label={t("Laboratorios")} title={t("Laboratorios: cambiar, crear, duplicar o eliminar")}
      button={<Icon name="chevron" size={18} />} align="start">
      {close => (
        <>
          {labs.length > 6 && (
            <input className="menu-search" type="search" value={query} placeholder={t("Buscar un laboratorio…")} aria-label={t("Buscar un laboratorio")}
              onChange={event => setQuery(event.target.value)} />
          )}
          {exercises.length > 0 && (
            <>
              <div className="menu-label">{t("Reto en curso")}</div>
              <div className="menu-list">
                {exercises.map(lab => <LabRow key={lab.id} lab={lab} current={lab.id === labId} exercise={attempts[lab.id].exercise} close={close} />)}
              </div>
            </>
          )}
          <div className="menu-label">{t("Tus laboratorios ({n})", { n: labs.length - Object.keys(attempts).filter(id => labs.some(lab => lab.id === id)).length })}</div>
          <div className="menu-list">
            {own.map(lab => <LabRow key={lab.id} lab={lab} current={lab.id === labId} close={close} />)}
            {!own.length && <p className="menu-empty small muted">{t("Ningún laboratorio con ese nombre.")}</p>}
          </div>
          <div className="menu-sep" role="separator" />
          <button type="button" role="menuitem" onClick={() => { store().createLab("empty"); close(); }}>
            <Icon name="plus" size={16} />{t("Nuevo laboratorio vacío")}
          </button>
          <button type="button" role="menuitem" onClick={() => { store().setGallery(true); close(); }}>
            <Icon name="logo" size={16} />{t("Nuevo desde una plantilla…")}
          </button>
          <button type="button" role="menuitem" onClick={() => { store().createLab("duplicate"); close(); }}>
            <Icon name="copy" size={16} />{t("Duplicar este laboratorio")}
          </button>
        </>
      )}
    </Dropdown>
  );
}

function Swatch({ colors }: { colors: [string, string, string] }) {
  return <span className="swatch" aria-hidden="true">{colors.map(color => <i key={color} style={{ background: color }} />)}</span>;
}

/** The language of the interface (and of what the simulator explains). */
function LangMenu() {
  const lang = useLang(state => state.lang);
  const t = useT();
  const current = LANGS.find(item => item.id === lang)!;
  return (
    <Dropdown label={t("Idioma")} title={t("Idioma")} className="lang-menu"
      button={<><Icon name="globe" size={17} /><span className="lang-short">{current.short}</span></>}>
      {close => LANGS.map(item => (
        <button key={item.id} type="button" role="menuitemradio" aria-checked={item.id === lang} lang={item.html}
          onClick={() => { useLang.getState().setLang(item.id); close(); }}>
          <span className="lang-code">{item.short}</span><span>{item.label}</span>
          {item.id === lang && <span className="check" aria-hidden="true">✓</span>}
        </button>
      ))}
    </Dropdown>
  );
}

function ThemeMenu() {
  const theme = useStore(state => state.theme);
  const t = useT();
  const current = THEMES.find(item => item.id === theme) ?? THEMES[0];
  return (
    <Dropdown label={t("Tema de color")} title={t("Tema de color")} button={<><Swatch colors={current.swatch} />{t(current.label)}</>} className="theme-menu">
      {close => THEMES.map(item => (
        <button key={item.id} type="button" role="menuitemradio" aria-checked={item.id === theme}
          onClick={() => { useStore.getState().setTheme(item.id); close(); }}>
          <Swatch colors={item.swatch} /><span>{t(item.label)}</span>
          {item.id === theme && <span className="check" aria-hidden="true">✓</span>}
        </button>
      ))}
    </Dropdown>
  );
}

export function Avatar({ size = 34 }: { size?: number }) {
  const name = useProfile(state => state.name);
  const photo = useProfile(state => state.photo);
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * .38 }} aria-hidden="true">
      {photo ? <img src={photo} alt="" /> : initials(name)}
    </span>
  );
}

/** the avatar: it opens the user's dashboard */
function ProfileButton() {
  const name = useProfile(state => state.name);
  const t = useT();
  return (
    <button type="button" className="dropdown-button profile-button" title={t("Tu panel: perfil, preferencias y laboratorios")}
      aria-label={t("Abrir tu panel ({name})", { name })} onClick={() => useStore.getState().setDashboard("profile")}>
      <Avatar /><Icon name="chevron" size={16} />
    </button>
  );
}

export function TopBar() {
  const name = useStore(state => state.topology.name);
  const mode = useStore(state => state.mode);
  const sidebar = useStore(state => state.sidebar);
  const inspectLab = useStore(state => state.inspectLab);
  const t = useT();
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);

  const rename = () => {
    const next = draft.trim();
    const state = useStore.getState();
    if(next && next !== state.topology.name) state.commit({ ...state.topology, name: next });
    else setDraft(state.topology.name);
  };

  return (
    <header className="topbar">
      <div className="brand">
        <button type="button" className="icon-button sidebar-toggle" aria-pressed={sidebar} aria-label={sidebar ? t("Ocultar el menú") : t("Mostrar el menú")}
          title={sidebar ? t("Ocultar el menú") : t("Mostrar el menú")} onClick={() => useStore.getState().setSidebar(!sidebar)}>
          <Icon name="menu" size={20} />
        </button>
        <button type="button" className="brand-home" aria-current={mode === "home" ? "page" : undefined} title={t("Inicio")} onClick={() => chooseMode("home")}>
          <span className="brand-mark"><Icon name="logo" size={20} /></span>
          <span className="brand-name">visual-tracert</span>
        </button>
        <span className="brand-version" title={t("Versión {version}", { version: __APP_VERSION__ })}>v{__APP_VERSION__}</span>
      </div>

      <div className="modes" role="radiogroup" aria-label={t("Modo")}>
        {MODES.map(item => (
          <button key={item.id} type="button" role="radio" aria-checked={mode === item.id} title={t(item.title)}
            className={mode === item.id ? "active" : ""} onClick={() => chooseMode(item.id)}>
            <Icon name={item.id} size={17} />{t(item.label)}
          </button>
        ))}
      </div>

      <div className="lab-title">
        <span className="crumb">{t("Laboratorios")}</span>
        <span className="crumb-sep" aria-hidden="true">/</span>
        <input className="lab-name" aria-label={t("Nombre del laboratorio")} value={draft} size={Math.max(8, draft.length)}
          onChange={event => setDraft(event.target.value)} onBlur={rename}
          onKeyDown={event => { if(event.key === "Enter") (event.target as HTMLInputElement).blur(); }} />
        <button type="button" className="icon-button lab-info" aria-pressed={inspectLab} title={t("Ver el laboratorio: sus notas y topologías")}
          aria-label={t("Ver el laboratorio")} onClick={() => { const state = useStore.getState(); state.select(null); state.setInspectLab(!state.inspectLab); }}>
          <Icon name="info" size={17} />
        </button>
        <LabMenu />
      </div>

      <div className="topbar-actions">
        <LangMenu />
        <ThemeMenu />
        <ProfileButton />
      </div>
    </header>
  );
}
