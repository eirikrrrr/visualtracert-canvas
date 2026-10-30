// Top bar: the mode, the lab being edited (its name and the menu of labs:
// switch, new, from a template, duplicate, delete), the language, the theme
// and the local profile.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LabMeta } from "../app/labs";
import { initials, squarePhoto, useProfile } from "../app/profile";
import { THEMES, useStore, type Mode } from "../app/store";
import { Icon } from "../editor/icons";
import { LANGS, tx, useLang, useT, type T } from "../i18n";

const MODES: { id: Mode; label: string; title: string }[] = [
  { id: "simulation", label: tx("Simulación"), title: tx("La red se simula aquí: cada acción se ve trama a trama sobre el lienzo") },
  { id: "emulation", label: tx("Emulación"), title: tx("Cada equipo es un contenedor real y cada cable, un enlace virtual: los comandos se ejecutan de verdad") },
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

function LabMenu() {
  const labs = useStore(state => state.labs);
  const labId = useStore(state => state.labId);
  const [confirming, setConfirming] = useState(false);
  const store = useStore.getState;
  const t = useT();
  const locale = LANGS.find(item => item.id === useLang.getState().lang)!.html;
  return (
    <Dropdown className="lab-menu" label={t("Laboratorios")} title={t("Laboratorios: cambiar, crear, duplicar o eliminar")}
      button={<Icon name="chevron" size={18} />} align="start">
      {close => (
        <>
          <div className="menu-label">{t("Tus laboratorios")}</div>
          <div className="menu-list">
            {labs.map((lab: LabMeta) => (
              <button key={lab.id} type="button" role="menuitemradio" aria-checked={lab.id === labId}
                onClick={() => { store().switchLab(lab.id); close(); }}>
                <Icon name="file" size={16} />
                <span className="menu-text"><span>{lab.name}</span><small>{ago(lab.updatedAt, t, locale)}</small></span>
                {lab.id === labId && <span className="check" aria-hidden="true">✓</span>}
              </button>
            ))}
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
          {confirming ? (
            <div className="menu-confirm">
              <span>{t("¿Eliminar «{name}»? No se puede deshacer.", { name: store().topology.name })}</span>
              <div>
                <button type="button" className="ghost small" onClick={() => setConfirming(false)}>{t("Cancelar")}</button>
                <button type="button" className="danger small" onClick={() => { store().removeLab(labId); setConfirming(false); close(); }}>{t("Eliminar")}</button>
              </div>
            </div>
          ) : (
            <button type="button" role="menuitem" className="menu-danger" onClick={() => setConfirming(true)}>
              <Icon name="trash" size={16} />{t("Eliminar este laboratorio")}
            </button>
          )}
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

function ProfileMenu() {
  const name = useProfile(state => state.name);
  const photo = useProfile(state => state.photo);
  const [draft, setDraft] = useState(name);
  const fileInput = useRef<HTMLInputElement>(null);
  const t = useT();
  useEffect(() => setDraft(name), [name]);
  const saveName = () => {
    const next = draft.trim();
    if(next && next !== name) useProfile.getState().update({ name: next });
    else setDraft(name);
  };
  return (
    <Dropdown className="profile-menu" label={t("Perfil")} title={name} button={<><Avatar /><Icon name="chevron" size={16} /></>}>
      {() => (
        <div className="profile-card">
          <Avatar size={56} />
          <label className="field">
            <span>{t("Nombre")}</span>
            <input value={draft} onChange={event => setDraft(event.target.value)} onBlur={saveName}
              onKeyDown={event => { if(event.key === "Enter") (event.target as HTMLInputElement).blur(); }} />
          </label>
          <div className="profile-actions">
            <button type="button" className="ghost small" onClick={() => fileInput.current?.click()}>
              <Icon name="upload" size={15} />{photo ? t("Cambiar foto") : t("Poner una foto")}
            </button>
            {photo && <button type="button" className="ghost small" onClick={() => useProfile.getState().update({ photo: undefined })}>{t("Quitar")}</button>}
          </div>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={async event => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if(!file) return;
            try{ useProfile.getState().update({ photo: await squarePhoto(file) }); }
            catch(error){ useStore.getState().notify((error as Error).message, "error"); }
          }} />
          <p className="muted small">{t("Perfil de este navegador: todavía no hay cuentas.")}</p>
        </div>
      )}
    </Dropdown>
  );
}

export function TopBar() {
  const name = useStore(state => state.topology.name);
  const mode = useStore(state => state.mode);
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
        <span className="brand-mark"><Icon name="logo" size={20} /></span>
        <span className="brand-name">visual-tracert</span>
        <span className="brand-version" title={t("Versión {version}", { version: __APP_VERSION__ })}>v{__APP_VERSION__}</span>
      </div>

      <div className="modes" role="radiogroup" aria-label={t("Modo")}>
        {MODES.map(item => (
          <button key={item.id} type="button" role="radio" aria-checked={mode === item.id} title={t(item.title)}
            className={mode === item.id ? "active" : ""} onClick={() => useStore.getState().setMode(item.id)}>
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
        <LabMenu />
      </div>

      <div className="topbar-actions">
        <LangMenu />
        <ThemeMenu />
        <ProfileMenu />
      </div>
    </header>
  );
}
