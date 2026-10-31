// The seasons: sets of new or recent machines around a theme (a protocol like
// BGP or OSPF, a topic), chosen by the admins, between two dates. Tall cards
// like posters (its colour, its icon, its theme, its name, its dates and
// whether it runs); one opens its page: what its machines are based on, the
// machines and the season's own ranking. An admin makes, changes and removes
// them here. The season running shows in the side menu with the user's place.
import { EXERCISES, LANGS, exerciseById } from "@visual-tracert/model";
import { useEffect, useState, type CSSProperties } from "react";
import { useAuth } from "../app/auth";
import { useStore } from "../app/store";
import { Icon } from "../editor/icons";
import { useLang, useT } from "../i18n";
import { MachineTable, SectionHead, useView } from "./common";
import { Rankings } from "./Rankings";
import { practiceApi, useShared, type Season, type SeasonInput } from "./server";

const ICONS = ["router", "globe", "switch", "firewall", "server", "cloud", "search", "pc", "emulation", "trophy", "flag"];
const DAY = 24 * 3600e3;

type Phase = "running" | "upcoming" | "over";
const phaseOf = (season: Season, now = Date.now()): Phase => now < season.startsAt ? "upcoming" : now > season.endsAt ? "over" : "running";

/** the season running now, if any (the one that started last) */
export function useCurrentSeason(): Season | undefined {
  const seasons = useShared(state => state.seasons);
  return (seasons ?? []).filter(season => phaseOf(season) === "running").sort((p, q) => q.startsAt - p.startsAt)[0];
}

function useDates() {
  const lang = useLang(state => state.lang);
  const locale = LANGS.find(item => item.id === lang)!.html;
  return (time: number) => new Date(time).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

function PhaseTag({ season }: { season: Season }) {
  const t = useT();
  const phase = phaseOf(season);
  const days = Math.max(0, Math.ceil(((phase === "upcoming" ? season.startsAt : season.endsAt) - Date.now()) / DAY));
  return (
    <span className={`season-phase ${phase}`}>
      {phase === "running" ? t("En curso · quedan {n} días", { n: days }) : phase === "upcoming" ? t("Empieza en {n} días", { n: days }) : t("Terminada")}
    </span>
  );
}

/** a season as a tall card; compact: the side menu's, with the user's place */
export function SeasonCard({ season, compact = false }: { season: Season; compact?: boolean }) {
  const t = useT();
  const dates = useDates();
  const [place, setPlace] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if(!compact) return;
    practiceApi.ranking(season.id).then(ranking => setPlace(ranking.me?.position ?? null)).catch(() => setPlace(null));
  }, [compact, season.id]);
  const open = () => useView.setState({ section: "seasons", machine: null, track: null, season: season.id });
  if(compact) return (
    <button type="button" className="season-mini" style={{ "--season": season.color } as CSSProperties} onClick={open}>
      <span className="season-mini-icon" aria-hidden="true"><Icon name={season.icon} size={20} /></span>
      <span className="season-mini-text">
        <strong>{place ? t("Puesto {n}", { n: place }) : t("Sin clasificar")}</strong>
        <span className="mono small">{season.name}</span>
      </span>
      <span className="season-mini-theme">{season.theme}</span>
    </button>
  );
  return (
    <button type="button" className={`season-card ${phaseOf(season)}`} style={{ "--season": season.color } as CSSProperties} onClick={open}>
      <span className="season-art" aria-hidden="true">
        <span className="season-theme">{season.theme}</span>
        <Icon name={season.icon} size={76} />
      </span>
      <span className="season-text">
        <PhaseTag season={season} />
        <strong>{season.name}</strong>
        {season.summary && <span className="muted small season-summary">{season.summary}</span>}
        <span className="season-foot small">
          <span>{dates(season.startsAt)} – {dates(season.endsAt)}</span>
          <span>{t("{n} máquinas", { n: season.machines.length })}</span>
        </span>
      </span>
    </button>
  );
}

/** "2026-11-01" for a date input, and back */
const toDay = (time: number) => new Date(time - new Date(time).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fromDay = (day: string, end = false) => new Date(`${day}T${end ? "23:59:59" : "00:00:00"}`).getTime();

function SeasonEditor({ season, done }: { season?: Season; done: (saved?: Season) => void }) {
  const t = useT();
  const now = Date.now();
  const [draft, setDraft] = useState<SeasonInput>(season ?? {
    name: "", theme: "", summary: "", inspiration: "", color: "#4f8cff", icon: "router", startsAt: now, endsAt: now + 30 * DAY, machines: [],
  });
  const [busy, setBusy] = useState(false);
  const set = (change: Partial<SeasonInput>) => setDraft({ ...draft, ...change });
  const save = async () => {
    setBusy(true);
    try{
      const saved = season ? await practiceApi.updateSeason(season.id, draft) : await practiceApi.createSeason(draft);
      await useShared.getState().refreshSeasons();
      done(saved);
    }catch(error){ useStore.getState().notify((error as Error).message, "error"); }
    finally{ setBusy(false); }
  };
  return (
    <form className="season-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
      <h2>{season ? t("Editar «{name}»", { name: season.name }) : t("Nueva season")}</h2>
      <div className="season-editor-grid">
        <label className="field"><span>{t("Nombre")}</span><input required maxLength={60} placeholder={t("Season 1: El despertar de BGP")} value={draft.name} onChange={event => set({ name: event.target.value })} /></label>
        <label className="field"><span>{t("Tema")}</span><input required maxLength={30} placeholder="BGP, OSPF, VLAN…" value={draft.theme} onChange={event => set({ theme: event.target.value })} /></label>
        <label className="field"><span>{t("Empieza")}</span><input type="date" required value={toDay(draft.startsAt)} onChange={event => set({ startsAt: fromDay(event.target.value) })} /></label>
        <label className="field"><span>{t("Termina")}</span><input type="date" required value={toDay(draft.endsAt)} onChange={event => set({ endsAt: fromDay(event.target.value, true) })} /></label>
        <label className="field"><span>{t("Color")}</span><input type="color" value={draft.color} onChange={event => set({ color: event.target.value })} /></label>
        <div className="field"><span>{t("Icono")}</span>
          <div className="season-icons" role="radiogroup" aria-label={t("Icono")}>
            {ICONS.map(icon => (
              <button key={icon} type="button" role="radio" aria-checked={draft.icon === icon} className={draft.icon === icon ? "active" : ""} onClick={() => set({ icon })}>
                <Icon name={icon} size={17} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <label className="field"><span>{t("Resumen")}</span><input maxLength={400} placeholder={t("Una frase para la tarjeta")} value={draft.summary} onChange={event => set({ summary: event.target.value })} /></label>
      <label className="field"><span>{t("En qué se basan sus máquinas")}</span>
        <textarea rows={4} maxLength={1200} placeholder={t("El protocolo o el tema, qué se aprende y por qué esta season")} value={draft.inspiration} onChange={event => set({ inspiration: event.target.value })} />
      </label>
      <fieldset className="season-machines">
        <legend>{t("Máquinas ({n})", { n: draft.machines.length })}</legend>
        {EXERCISES.map(exercise => (
          <label key={exercise.id}>
            <input type="checkbox" checked={draft.machines.includes(exercise.id)}
              onChange={event => set({ machines: event.target.checked ? [...draft.machines, exercise.id] : draft.machines.filter(id => id !== exercise.id) })} />
            <span><strong>{t(exercise.codename)}</strong> <span className="muted small">{t(exercise.title)}</span></span>
          </label>
        ))}
      </fieldset>
      <div className="challenge-actions">
        <button type="submit" className="primary" disabled={busy}>{busy ? t("Guardando…") : t("Guardar")}</button>
        <button type="button" className="ghost" onClick={() => done()}>{t("Cancelar")}</button>
      </div>
    </form>
  );
}

function SeasonPage({ season }: { season: Season }) {
  const t = useT();
  const dates = useDates();
  const admin = useAuth(state => state.user?.role === "admin");
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if(editing) return <SeasonEditor season={season} done={() => setEditing(false)} />;
  const machines = season.machines.map(id => exerciseById(id)!).filter(Boolean);
  const remove = async () => {
    try{
      await practiceApi.deleteSeason(season.id);
      await useShared.getState().refreshSeasons();
      useView.setState({ season: null });
    }catch(error){ useStore.getState().notify((error as Error).message, "error"); }
  };
  return (
    <div className="season-page" style={{ "--season": season.color } as CSSProperties}>
      <button type="button" className="ghost small machine-back" onClick={() => useView.setState({ season: null })}>← {t("Todas las seasons")}</button>
      <header className="season-banner">
        <span className="season-banner-icon" aria-hidden="true"><Icon name={season.icon} size={56} /></span>
        <div>
          <span className="section-kicker">{t("Season")} · {season.theme}</span>
          <h1>{season.name}</h1>
          {season.summary && <p>{season.summary}</p>}
          <ul className="start-chips">
            <li><Icon name="calendar" size={15} />{dates(season.startsAt)} – {dates(season.endsAt)}</li>
            <li><Icon name="topology" size={15} />{t("{n} máquinas", { n: machines.length })}</li>
            <li><PhaseTag season={season} /></li>
          </ul>
        </div>
        {admin && (
          <div className="season-admin">
            <button type="button" className="ghost small" onClick={() => setEditing(true)}><Icon name="settings" size={14} />{t("Editar")}</button>
            {confirm ? (
              <span className="dash-confirm">
                <button type="button" className="danger" onClick={() => void remove()}>{t("Eliminar")}</button>
                <button type="button" className="ghost small" onClick={() => setConfirm(false)}>{t("Cancelar")}</button>
              </span>
            ) : <button type="button" className="icon-button" aria-label={t("Eliminar la season")} title={t("Eliminar")} onClick={() => setConfirm(true)}><Icon name="trash" size={15} /></button>}
          </div>
        )}
      </header>
      {season.inspiration && (
        <section className="season-inspiration">
          <h3>{t("En qué se basan sus máquinas")}</h3>
          <p>{season.inspiration}</p>
        </section>
      )}
      <h3>{t("Máquinas de la season")}</h3>
      {machines.length ? <MachineTable exercises={machines} /> : <p className="muted small">{t("Esta season aún no tiene máquinas.")}</p>}
      <h3>{t("Ranking de la season")}</h3>
      <p className="muted small">{t("Cuentan sus máquinas superadas entre sus fechas.")}</p>
      <Rankings season={season.id} />
    </div>
  );
}

export function Seasons() {
  const t = useT();
  const seasons = useShared(state => state.seasons);
  const open = useView(state => state.season);
  const admin = useAuth(state => state.user?.role === "admin");
  const [creating, setCreating] = useState(false);
  const season = open !== null ? seasons?.find(item => item.id === open) : undefined;
  if(creating) return <SeasonEditor done={saved => { setCreating(false); if(saved) useView.setState({ season: saved.id }); }} />;
  if(season) return <SeasonPage season={season} />;
  const order: Record<Phase, number> = { running: 0, upcoming: 1, over: 2 };
  const list = [...(seasons ?? [])].sort((p, q) => order[phaseOf(p)] - order[phaseOf(q)] || q.startsAt - p.startsAt);
  return (
    <>
      <SectionHead icon="calendar" title={t("Seasons")} lead={t("Temporadas de máquinas nuevas alrededor de un tema, como BGP u OSPF, elegidas por los administradores. Cada una tiene su propio ranking.")}>
        {admin && <button type="button" className="primary small" onClick={() => setCreating(true)}><Icon name="plus" size={15} />{t("Nueva season")}</button>}
      </SectionHead>
      {seasons === null ? <p className="muted small">{t("Cargando…")}</p> : list.length ? (
        <div className="season-grid">{list.map(item => <SeasonCard key={item.id} season={item} />)}</div>
      ) : (
        <div className="machine-locked">
          <Icon name="calendar" size={28} />
          <strong>{t("Aún no hay seasons")}</strong>
          <span className="muted small">{admin ? t("Crea la primera: elige un tema, sus fechas y sus máquinas.") : t("Cuando un administrador abra una, aparecerá aquí.")}</span>
        </div>
      )}
    </>
  );
}
