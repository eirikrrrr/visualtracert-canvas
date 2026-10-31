// What the sections of Practice share: where it is (its section, the machine,
// track or season open), the player's card, the difficulty picker, a machine's
// difficulty meter, its state for the user, its play button and its row in a
// table of machines.
import {
  BOXES, DIFFICULTY_LABEL, hasDifficulty, isUnlocked, LEVEL_LABEL, rankOf, solvedKey, TIME_LIMIT, xpOf,
  type Difficulty, type Exercise, type ExerciseLevel,
} from "@visual-tracert/model";
import type { ReactNode } from "react";
import { create } from "zustand";
import { Icon } from "../editor/icons";
import { tx, useT } from "../i18n";
import { MachineAvatar } from "./MachineAvatar";
import { clock, resumeExercise, startExercise, useProgress } from "./progress";
import { useShared } from "./server";

export type Section = "start" | "machines" | "tracks" | "seasons" | "ranking";

/** where practice is: its section, and what is open in it (kept while the app runs) */
export const useView = create<{ section: Section; machine: string | null; track: string | null; season: number | null; tier: number }>(() => ({
  section: "start", machine: null, track: null, season: null, tier: 0,
}));

/** opens a section (closing what was open in the one before) */
export const go = (section: Section) => useView.setState({ section, machine: null, track: null, season: null });

const DIFFICULTIES: { id: Difficulty; hint: string; icon: string }[] = [
  { id: "easy", hint: tx("Desde la interfaz: propiedades y documento; se comprueba en la simulación."), icon: "select" },
  { id: "medium", hint: tx("Solo desde la CLI de cada equipo, en contenedores reales: la interfaz queda bloqueada."), icon: "emulation" },
];


/** a machine's difficulty as bars: more and redder the harder */
export function Meter({ level }: { level: ExerciseLevel }) {
  const t = useT();
  const filled = { 1: 3, 2: 6, 3: 9 }[level];
  return (
    <span className={`meter meter-${level}`} role="img" aria-label={t(LEVEL_LABEL[level])}>
      {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < filled ? "on" : ""} style={{ height: 4 + Math.round(Math.sin((i + 1) / 10 * Math.PI) * 10) }} />)}
    </span>
  );
}

/** the player: their rank, level and points, and how far the next rank is */
export function PlayerCard() {
  const t = useT();
  const done = useProgress(state => state.done);
  const rank = rankOf(done);
  return (
    <div className="player-card">
      <span className="player-badge" aria-hidden="true"><Icon name="practice" size={22} /></span>
      <div className="player-text">
        <strong>{t(rank.rank)}</strong>
        <span className="mono small">{t("Nivel {n}", { n: rank.level })} · {rank.xp} XP</span>
        <span className="player-bar" title={rank.next ? t("{n} XP para {rank}", { n: rank.next.from - rank.xp, rank: t(rank.next.name) }) : t("Rango máximo")}>
          <i style={{ width: `${rank.progress * 100}%` }} />
        </span>
      </div>
    </div>
  );
}

export function DifficultyPicker({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const difficulty = useProgress(state => state.difficulty);
  return (
    <div className={`difficulty${compact ? " compact" : ""}`} role="radiogroup" aria-label={t("Dificultad")}>
      {DIFFICULTIES.map(item => (
        <button key={item.id} type="button" role="radio" aria-checked={difficulty === item.id} className={difficulty === item.id ? "active" : ""}
          title={t(item.hint)} onClick={() => useProgress.getState().setDifficulty(item.id)}>
          <strong><Icon name={item.icon} size={15} />{t(DIFFICULTY_LABEL[item.id])}</strong>
          {!compact && <span>{t(item.hint)}</span>}
        </button>
      ))}
    </div>
  );
}

/** what the user can do with a machine now, in the chosen difficulty */
export function useMachineState(exercise: Exercise) {
  const difficulty = useProgress(state => state.difficulty);
  const done = useProgress(state => state.done);
  const times = useProgress(state => state.times);
  const attempts = useProgress(state => state.labs);
  const key = solvedKey(exercise.id, difficulty);
  const available = hasDifficulty(exercise, difficulty);
  // the attempt in progress (one at most: the others' labs are thrown away), open or not
  const running = Object.entries(attempts).find(([, attempt]) => attempt.exercise === exercise.id && attempt.difficulty === difficulty && attempt.solvedIn === undefined && !attempt.expired);
  return {
    difficulty, available,
    open: available && isUnlocked(exercise, done, difficulty),
    solved: Boolean(done[key]),
    best: times[key],
    here: running?.[0],
    solvedAny: Boolean(done[solvedKey(exercise.id, "easy")] || done[solvedKey(exercise.id, "medium")]),
  };
}

/** its action: start it, carry on, or why it cannot be played */
export function PlayButton({ exercise, size = "small" }: { exercise: Exercise; size?: "small" | "large" }) {
  const t = useT();
  const state = useMachineState(exercise);
  const primary = size === "large" ? "primary" : "primary small";
  const ghost = size === "large" ? "ghost" : "ghost small";
  if(!state.available) return <span className="box-status muted small" title={exercise.cliUnavailable ? t(exercise.cliUnavailable) : undefined}>{t("Solo Fácil")}</span>;
  if(!state.open) return <span className="box-status muted small" title={t("Supera antes el nivel anterior de esta caja.")}><Icon name="lock" size={15} />{t("Bloqueado")}</span>;
  if(state.here){
    return <button type="button" className={primary} onClick={event => { event.stopPropagation(); resumeExercise(state.here!); }}>{t("Seguir")}</button>;
  }
  return (
    <button type="button" className={state.solved ? ghost : primary} onClick={event => { event.stopPropagation(); void startExercise(exercise.id, state.difficulty); }}>
      <Icon name={state.solved ? "restart" : "play"} size={size === "large" ? 16 : 14} />
      {state.solved ? t("Repetir") : size === "large" ? t("Iniciar máquina") : t("Empezar")}
    </button>
  );
}

// --- a machine's row in a table ------------------------------------------------

/** how many solved a machine (in the chosen difficulty), and who first */
export function Solves({ exercise }: { exercise: Exercise }) {
  const t = useT();
  const difficulty = useProgress(state => state.difficulty);
  const figures = useShared(state => state.figures[exercise.id]?.[difficulty]);
  if(!figures) return <span className="muted">0</span>;
  return (
    <span className="solves-cell" title={figures.first ? t("Primera vez: {name}", { name: figures.first.name }) : undefined}>
      <span aria-hidden="true">#</span>{figures.solves}
    </span>
  );
}

export function MachineRow({ exercise }: { exercise: Exercise }) {
  const t = useT();
  const state = useMachineState(exercise);
  const box = BOXES.find(item => item.id === exercise.box)!;
  const show = () => useView.setState({ machine: exercise.id });
  return (
    <tr className={`machine-row${!state.open ? " locked" : ""}`} tabIndex={0} onClick={show} onKeyDown={event => { if(event.key === "Enter") show(); }}>
      <td>
        <div className="machine-cell">
          <MachineAvatar exercise={exercise} size={44} solved={state.solved} />
          <div>
            <strong>{t(exercise.codename)}</strong>
            <span className="mono small muted">{t(LEVEL_LABEL[exercise.level])} · {t(box.title)}</span>
          </div>
        </div>
      </td>
      <td><Meter level={exercise.level} /></td>
      <td>
        <span className="modes-cell">
          <span className="tag" title={t("Fácil: desde la interfaz")}>{t("Fácil")}</span>
          <span className={`tag${exercise.cli ? " medium-tag" : " off"}`} title={exercise.cli ? t("Medio: desde la CLI") : t(exercise.cliUnavailable ?? "")}>{t("Medio")}</span>
        </span>
      </td>
      <td className="mono small">{TIME_LIMIT[state.difficulty][exercise.level]} min</td>
      <td className="mono small xp-cell">{state.available ? `+${xpOf(exercise, state.difficulty)} XP` : "—"}</td>
      <td className="mono small"><Solves exercise={exercise} /></td>
      <td>
        {state.solved
          ? <span className="solved-cell"><Icon name="check" size={14} />{state.best !== undefined ? clock(state.best) : t("Superada")}</span>
          : <span className="muted small">{state.open ? t("Por superar") : state.available ? t("Bloqueada") : t("Solo Fácil")}</span>}
      </td>
      <td className="play-cell"><PlayButton exercise={exercise} /></td>
    </tr>
  );
}

/** machines in a table: its header and rows (a section's own list) */
export function MachineTable({ exercises }: { exercises: Exercise[] }) {
  const t = useT();
  return (
    <div className="machine-table-wrap">
      <table className="machine-table">
        <thead>
          <tr>
            <th>{t("Máquina")}</th><th>{t("Dificultad")}</th><th>{t("Modos")}</th><th>{t("Tiempo")}</th><th>XP</th><th>{t("Resuelta")}</th><th>{t("Tu estado")}</th><th />
          </tr>
        </thead>
        <tbody>
          {exercises.map(exercise => <MachineRow key={exercise.id} exercise={exercise} />)}
        </tbody>
      </table>
    </div>
  );
}

/** a section's title, what it is, and its own controls on the right */
export function SectionHead({ icon, title, lead, kicker, children }: { icon: string; title: string; lead?: string; kicker?: string; children?: ReactNode }) {
  return (
    <header className="section-head">
      <span className="section-icon" aria-hidden="true"><Icon name={icon} size={22} /></span>
      <div className="section-text">
        {kicker && <span className="section-kicker">{kicker}</span>}
        <h1>{title}</h1>
        {lead && <p className="muted">{lead}</p>}
      </div>
      {children && <div className="section-tools">{children}</div>}
    </header>
  );
}
