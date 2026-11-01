// The tracks: curated paths through the machines, each with a goal. Cards in
// a grid (its icon large on its colour, its level, its title, its machines
// and how many the user solved); one opens its page: what it prepares for,
// the difficulty it is meant for and its machines in order.
import { DIFFICULTY_LABEL, exerciseById, LEVEL_LABEL, solvedKey, TRACKS, type Track } from "@visual-tracert/model";
import { useState, type CSSProperties } from "react";
import { Icon } from "../editor/icons";
import { useT } from "../i18n";
import { BackButton, MachineTable, SectionHead, useView } from "./common";
import { useProgress } from "./progress";

/** how many of a track's machines are solved, in its difficulty */
function useTrackProgress(track: Track): number {
  const done = useProgress(state => state.done);
  return track.machines.filter(id => done[solvedKey(id, track.difficulty)]).length;
}

function TrackCard({ track }: { track: Track }) {
  const t = useT();
  const solved = useTrackProgress(track);
  return (
    <button type="button" className={`track-card${track.upcoming ? " upcoming" : ""}`} style={{ "--track": track.color } as CSSProperties}
      onClick={() => useView.setState({ track: track.id })}>
      <span className="track-art" aria-hidden="true">
        <span className="track-corner"><Icon name="layers" size={16} /></span>
        <Icon name={track.icon} size={88} />
      </span>
      <span className="track-text">
        <span className={`track-level level-${track.level}`}>{t(LEVEL_LABEL[track.level])}{track.difficulty === "medium" ? ` · ${t("Medio")}` : ""}</span>
        <strong>{t(track.title)}</strong>
        <span className="muted small">{t(track.summary)}</span>
        <span className="track-foot small">
          {track.upcoming ? t("Próximamente") : t("{n} de {total} máquinas", { n: solved, total: track.machines.length })}
        </span>
        {!track.upcoming && <span className="player-bar"><i style={{ width: `${track.machines.length ? solved / track.machines.length * 100 : 0}%` }} /></span>}
      </span>
    </button>
  );
}

function TrackPage({ track }: { track: Track }) {
  const t = useT();
  const solved = useTrackProgress(track);
  const difficulty = useProgress(state => state.difficulty);
  const machines = track.machines.map(id => exerciseById(id)!).filter(Boolean);
  return (
    <div className="track-page" style={{ "--track": track.color } as CSSProperties}>
      <BackButton label={t("Todos los tracks")} onClick={() => useView.setState({ track: null })} />
      <header className="track-banner">
        <span className="track-banner-icon" aria-hidden="true"><Icon name={track.icon} size={52} /></span>
        <div>
          <span className="section-kicker">{t("Track")} · {t(LEVEL_LABEL[track.level])}</span>
          <h1>{t(track.title)}</h1>
          <p className="muted">{t(track.goal)}</p>
          <ul className="start-chips">
            <li><Icon name="topology" size={15} />{t("{n} máquinas", { n: machines.length })}</li>
            <li><Icon name={track.difficulty === "medium" ? "emulation" : "select"} size={15} />{t("Pensado para {difficulty}", { difficulty: t(DIFFICULTY_LABEL[track.difficulty]) })}</li>
            {!track.upcoming && <li><Icon name="check" size={15} />{t("{n} de {total} superadas", { n: solved, total: machines.length })}</li>}
          </ul>
        </div>
      </header>
      {track.upcoming ? <p className="emu-note">{t(track.upcoming)}</p> : (
        <>
          {difficulty !== track.difficulty && (
            <div className="track-mode emu-note small">
              <span>{t("Este track se juega en {difficulty}; ahora tienes elegido {current}.", { difficulty: t(DIFFICULTY_LABEL[track.difficulty]), current: t(DIFFICULTY_LABEL[difficulty]) })}</span>
              <button type="button" className="primary small" onClick={() => useProgress.getState().setDifficulty(track.difficulty)}>{t("Cambiar a {difficulty}", { difficulty: t(DIFFICULTY_LABEL[track.difficulty]) })}</button>
            </div>
          )}
          <MachineTable exercises={machines} />
        </>
      )}
    </div>
  );
}

export function Tracks() {
  const t = useT();
  const open = useView(state => state.track);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const track = open ? TRACKS.find(item => item.id === open) : undefined;
  if(track) return <TrackPage track={track} />;
  const words = query.trim().toLowerCase();
  const list = TRACKS.filter(item => (!words || [item.title, item.summary, item.goal].some(text => t(text).toLowerCase().includes(words)))
    && (!level || String(item.level) === level));
  return (
    <>
      <SectionHead icon="layers" title={t("Tracks")} lead={t("Caminos guiados por las máquinas, cada uno con un objetivo: de los primeros pasos a resolverlo todo desde la CLI.")} />
      <div className="machine-tools">
        <label className="machine-search">
          <Icon name="search" size={16} />
          <input type="search" value={query} placeholder={t("Buscar tracks…")} aria-label={t("Buscar tracks")} onChange={event => setQuery(event.target.value)} />
        </label>
        <select value={level} aria-label={t("Dificultad")} onChange={event => setLevel(event.target.value)}>
          <option value="">{t("Todas las dificultades")}</option>
          {([1, 2, 3] as const).map(item => <option key={item} value={item}>{t(LEVEL_LABEL[item])}</option>)}
        </select>
      </div>
      <div className="track-grid">{list.map(item => <TrackCard key={item.id} track={item} />)}</div>
      {!list.length && <p className="muted small machine-empty">{t("Ningún track con esos filtros.")}</p>}
    </>
  );
}
