// Practice, in the manner of a hacking lab: the exercises are "machines", each
// with a name to remember, a story, an avatar, a level, a time and the points
// (XP) it gives, twice from the CLI. The header shows the player (their rank,
// level and points) and the next machine of the path. Two views: the
// machines, as a table to search and filter; and the path, the boxes by topic
// in their suggested order. A machine opens its page: play it (easy or
// medium), what it is about, and its solution once solved.
import {
  BOXES, BOX_COLOR, DIFFICULTY_LABEL, EXERCISES, exercisesOf, hasDifficulty, isUnlocked, LEVEL_LABEL, nextExercise, playableExercises,
  rankOf, solvedKey, TIME_LIMIT, xpOf, type Box, type Difficulty, type Exercise, type ExerciseLevel,
} from "@visual-tracert/model";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { create } from "zustand";
import { Icon } from "../editor/icons";
import { tx, useT } from "../i18n";
import { MachineAvatar } from "./MachineAvatar";
import { clock, resumeExercise, startExercise, useProgress } from "./progress";
import { Rankings } from "./Rankings";
import { useShared } from "./server";

const DIFFICULTIES: { id: Difficulty; hint: string; icon: string }[] = [
  { id: "easy", hint: tx("Desde la interfaz: propiedades y documento; se comprueba en la simulación."), icon: "select" },
  { id: "medium", hint: tx("Solo desde la CLI de cada equipo, en contenedores reales: la interfaz queda bloqueada."), icon: "emulation" },
];

/** where practice is: its view, and the machine open (kept while the app runs) */
const useView = create<{ tab: "machines" | "path" | "ranking"; machine: string | null }>(() => ({ tab: "machines", machine: null }));

/** a machine's difficulty as bars: more and redder the harder */
function Meter({ level }: { level: ExerciseLevel }) {
  const t = useT();
  const filled = { 1: 3, 2: 6, 3: 9 }[level];
  return (
    <span className={`meter meter-${level}`} role="img" aria-label={t(LEVEL_LABEL[level])}>
      {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < filled ? "on" : ""} style={{ height: 4 + Math.round(Math.sin((i + 1) / 10 * Math.PI) * 10) }} />)}
    </span>
  );
}

/** the player: their rank, level and points, and how far the next rank is */
function PlayerCard() {
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

function DifficultyPicker({ compact = false }: { compact?: boolean }) {
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
function useMachineState(exercise: Exercise) {
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
function PlayButton({ exercise, size = "small" }: { exercise: Exercise; size?: "small" | "large" }) {
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

// --- the machines: a table to search and filter -----------------------------

/** how many solved a machine (in the chosen difficulty), and who first */
function Solves({ exercise }: { exercise: Exercise }) {
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

type Shown = "all" | "todo" | "solved";

function MachineRow({ exercise }: { exercise: Exercise }) {
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

function MachinesView() {
  const t = useT();
  const done = useProgress(state => state.done);
  const difficulty = useProgress(state => state.difficulty);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const [topic, setTopic] = useState("");
  const [shown, setShown] = useState<Shown>("all");
  const words = query.trim().toLowerCase();
  const list = EXERCISES.filter(exercise => {
    const box = BOXES.find(item => item.id === exercise.box)!;
    const solved = Boolean(done[solvedKey(exercise.id, difficulty)]);
    return (!words || [exercise.codename, exercise.title, exercise.story, box.title].some(text => t(text).toLowerCase().includes(words)))
      && (!level || String(exercise.level) === level)
      && (!topic || exercise.box === topic)
      && (shown === "all" || (shown === "solved") === solved);
  });
  return (
    <>
      <div className="machine-tools">
        <label className="machine-search">
          <Icon name="search" size={16} />
          <input type="search" value={query} placeholder={t("Buscar máquinas…")} aria-label={t("Buscar máquinas")} onChange={event => setQuery(event.target.value)} />
        </label>
        <select value={shown} aria-label={t("Estado")} onChange={event => setShown(event.target.value as Shown)}>
          <option value="all">{t("Estado: todas")}</option>
          <option value="todo">{t("Por superar")}</option>
          <option value="solved">{t("Superadas")}</option>
        </select>
        <select value={level} aria-label={t("Dificultad")} onChange={event => setLevel(event.target.value)}>
          <option value="">{t("Todas las dificultades")}</option>
          {([1, 2, 3] as const).map(item => <option key={item} value={item}>{t(LEVEL_LABEL[item])}</option>)}
        </select>
        <select value={topic} aria-label={t("Tema")} onChange={event => setTopic(event.target.value)}>
          <option value="">{t("Todos los temas")}</option>
          {BOXES.filter(box => !box.upcoming).map(box => <option key={box.id} value={box.id}>{t(box.title)}</option>)}
        </select>
      </div>
      <div className="machine-table-wrap">
        <table className="machine-table">
          <thead>
            <tr>
              <th>{t("Máquina")}</th><th>{t("Dificultad")}</th><th>{t("Modos")}</th><th>{t("Tiempo")}</th><th>XP</th><th>{t("Resuelta")}</th><th>{t("Tu estado")}</th><th />
            </tr>
          </thead>
          <tbody>
            {list.map(exercise => <MachineRow key={exercise.id} exercise={exercise} />)}
          </tbody>
        </table>
        {!list.length && <p className="muted small machine-empty">{t("Ninguna máquina con esos filtros.")}</p>}
      </div>
    </>
  );
}

// --- the path: boxes by topic, in their order --------------------------------

function BoxStep({ box, step, difficulty }: { box: Box; step: number; difficulty: Difficulty }) {
  const t = useT();
  const done = useProgress(state => state.done);
  const exercises = exercisesOf(box.id);
  const playable = exercises.filter(item => hasDifficulty(item, difficulty));
  const solved = playable.filter(item => done[solvedKey(item.id, difficulty)]).length;
  const complete = !box.upcoming && playable.length > 0 && solved === playable.length;
  return (
    <li className={`roadmap-step${complete ? " done" : ""}${box.upcoming ? " upcoming" : ""}`}>
      <span className="roadmap-node" aria-hidden="true">{complete ? <Icon name="check" size={16} /> : step}</span>
      <article className="box-card" aria-labelledby={`box-${box.id}`}>
        <header className="box-head">
          <span className="box-icon" style={{ "--box": BOX_COLOR[box.id] } as CSSProperties}><Icon name={box.icon} size={22} /></span>
          <div className="box-title">
            <h2 id={`box-${box.id}`}>{t(box.title)}</h2>
            <p className="muted small">{t(box.summary)}</p>
          </div>
          {box.upcoming
            ? <span className="tag">{t("Próximamente")}</span>
            : playable.length > 0 && <span className="box-count" title={t("{n} de {total} superados", { n: solved, total: playable.length })}>{solved}/{playable.length}</span>}
        </header>
        {box.upcoming ? <p className="box-note small">{t(box.upcoming)}</p> : (
          <>
            <div className="box-bar" aria-hidden="true"><i style={{ width: `${playable.length ? (solved / playable.length) * 100 : 0}%` }} /></div>
            <ul className="box-exercises">
              {exercises.map(exercise => {
                const solvedHere = Boolean(done[solvedKey(exercise.id, difficulty)]);
                const open = hasDifficulty(exercise, difficulty) && isUnlocked(exercise, done, difficulty);
                return (
                  <li key={exercise.id} className={`${solvedHere ? "solved" : ""}${!open ? " locked" : ""}`} onClick={() => useView.setState({ machine: exercise.id })}>
                    <MachineAvatar exercise={exercise} size={36} solved={solvedHere} />
                    <div className="box-exercise-text">
                      <strong>{t(exercise.codename)}</strong>
                      <span className="muted small">{t(exercise.title)} · {t(LEVEL_LABEL[exercise.level])}</span>
                    </div>
                    <PlayButton exercise={exercise} />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </article>
    </li>
  );
}

// --- a machine's page --------------------------------------------------------

function MachinePage({ exercise }: { exercise: Exercise }) {
  const t = useT();
  const state = useMachineState(exercise);
  const [tab, setTab] = useState<"play" | "info" | "solution">("play");
  const box = BOXES.find(item => item.id === exercise.box)!;
  const lab = useMemo(() => exercise.build(t), [exercise, t]);
  const first = useShared(item => item.figures[exercise.id]?.[state.difficulty]?.first);
  const tabs = [
    { id: "play" as const, label: tx("Jugar") },
    { id: "info" as const, label: tx("Información") },
    { id: "solution" as const, label: tx("Solución") },
  ];
  return (
    <div className="machine-page" style={{ "--box": BOX_COLOR[exercise.box] } as CSSProperties}>
      <header className="machine-banner">
        <button type="button" className="ghost small machine-back" onClick={() => useView.setState({ machine: null })}>← {t("Volver")}</button>
        <div className="machine-hero">
          <MachineAvatar exercise={exercise} size={104} solved={state.solved} />
          <div className="machine-title">
            <h1>{t(exercise.codename)}</h1>
            <span className="mono muted">{t(LEVEL_LABEL[exercise.level])} · {t(box.title)}</span>
            <p className="small">{t(exercise.title)}</p>
          </div>
          <dl className="machine-stats">
            <div><dt>{t("Recompensa")}</dt><dd className="xp-cell">{state.available ? `+${xpOf(exercise, state.difficulty)} XP` : "—"}</dd></div>
            <div><dt>{t("Tiempo")}</dt><dd>{TIME_LIMIT[state.difficulty][exercise.level]} min</dd></div>
            <div><dt>{t("Dificultad")}</dt><dd><Meter level={exercise.level} /></dd></div>
            <div><dt>{t("Tu mejor tiempo")}</dt><dd>{state.best !== undefined ? clock(state.best) : "—"}</dd></div>
            <div><dt>{t("Resuelta por")}</dt><dd><Solves exercise={exercise} /></dd></div>
            <div><dt>{t("Primera vez")}</dt><dd className="small">{first ? first.name : "—"}</dd></div>
          </dl>
        </div>
      </header>
      <div className="tabs machine-tabs" role="tablist" aria-label={t(exercise.codename)}>
        {tabs.map(item => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
            {t(item.label)}{item.id === "solution" && !state.solvedAny && <Icon name="lock" size={13} />}
          </button>
        ))}
      </div>
      <div className="machine-body" key={tab}>
        {tab === "play" && (
          <>
            <DifficultyPicker compact />
            {!state.available && exercise.cliUnavailable && <p className="emu-note small">{t(exercise.cliUnavailable)}</p>}
            <section className="machine-start">
              <div>
                <strong>{state.here ? t("Tienes esta máquina en marcha") : state.solved ? t("Ya la superaste en este modo")
                  : !state.available ? t("No tiene modo Medio") : !state.open ? t("Bloqueada: supera antes el nivel anterior de «{box}»", { box: t(box.title) }) : t("Lista para empezar")}</strong>
                <span className="muted small">
                  {state.difficulty === "medium"
                    ? t("Se despliega con contenedores reales; tendrás {n} minutos y la interfaz bloqueada: todo desde la CLI.", { n: TIME_LIMIT.medium[exercise.level] })
                    : t("Se abre como laboratorio; tendrás {n} minutos para resolverla desde la interfaz.", { n: TIME_LIMIT.easy[exercise.level] })}
                </span>
              </div>
              <PlayButton exercise={exercise} size="large" />
            </section>
            <h3>{t("Tareas")}</h3>
            <ol className="machine-tasks">
              {exercise.goals.map((goal, i) => (
                <li key={goal.text} className={state.solved ? "done" : ""}>
                  <span className="task-number">{t("Tarea {n}", { n: i + 1 })}</span>
                  <span>{t(goal.text)}</span>
                  <Icon name={state.solved ? "check" : "lock"} size={15} />
                </li>
              ))}
            </ol>
          </>
        )}
        {tab === "info" && (
          <>
            <blockquote className="machine-story">{t(exercise.story)}</blockquote>
            <h3>{t("Qué harás")}</h3>
            <p>{t(exercise.summary)}</p>
            <h3>{t(box.title)}</h3>
            <p className="muted">{t(box.summary)}</p>
            <h3>{t("En el laboratorio ({devices} equipos, {links} cables)", { devices: lab.devices.length, links: lab.links.length })}</h3>
            <ul className="machine-devices">
              {lab.devices.map(device => (
                <li key={device.id}>
                  <Icon name={device.type} size={16} /><span>{device.name}</span>
                  <span className="mono muted small">{device.interfaces.filter(iface => iface.ip).map(iface => `${iface.ip}/${iface.prefix}`).join(", ") || "—"}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {tab === "solution" && (state.solvedAny ? (
          <>
            <p className="muted small">{t("Así lo resuelve la solución de referencia. Si lo hiciste de otra forma y «Comprobar» pasó, también es correcta.")}</p>
            <h3>{t("Desde la interfaz")}</h3>
            <ol className="machine-solution">{exercise.hints.map(hint => <li key={hint}>{t(hint)}</li>)}</ol>
            {exercise.cli && (
              <>
                <h3>{t("Desde la CLI")}</h3>
                <ol className="machine-solution mono">{exercise.cli.map(hint => <li key={hint}>{t(hint)}</li>)}</ol>
              </>
            )}
          </>
        ) : (
          <div className="machine-locked">
            <Icon name="lock" size={28} />
            <strong>{t("Supera la máquina para ver su solución")}</strong>
            <span className="muted small">{t("En cualquiera de sus modos. Mientras, las pistas de la tarjeta del reto te ayudan.")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- practice ----------------------------------------------------------------

export function PracticeHub() {
  const t = useT();
  const done = useProgress(state => state.done);
  const difficulty = useProgress(state => state.difficulty);
  const { tab, machine } = useView();
  const all = playableExercises(difficulty);
  const solved = all.filter(item => done[solvedKey(item.id, difficulty)]).length;
  const next = nextExercise(done, difficulty);
  const open = machine ? EXERCISES.find(item => item.id === machine) : undefined;
  useEffect(() => { void useShared.getState().refreshFigures(); }, []);
  if(open) return <main className="practice"><div className="practice-inner"><MachinePage exercise={open} /></div></main>;
  return (
    <main className="practice">
      <div className="practice-inner">
        <header className="practice-top">
          <PlayerCard />
          {next ? (
            <button type="button" className="featured" onClick={() => useView.setState({ machine: next.id })}>
              <MachineAvatar exercise={next} size={64} />
              <div>
                <span className="featured-tag">{solved ? t("Siguiente en tu camino") : t("Empieza aquí")}</span>
                <strong>{t(next.codename)}</strong>
                <span className="mono small muted">{t(LEVEL_LABEL[next.level])} · {t(BOXES.find(box => box.id === next.box)!.title)}</span>
              </div>
            </button>
          ) : <div className="featured done"><strong>{t("¡Todo superado!")}</strong><span className="muted small">{t("Prueba el otro modo, o mejora tus tiempos.")}</span></div>}
          <div className="featured progress-card">
            <span className="featured-tag">{t("Tu progreso en {difficulty}", { difficulty: t(DIFFICULTY_LABEL[difficulty]) })}</span>
            <strong>{t("{n} de {total}", { n: solved, total: all.length })}</strong>
            <span className="player-bar"><i style={{ width: `${all.length ? (solved / all.length) * 100 : 0}%` }} /></span>
          </div>
        </header>
        <div className="practice-bar">
          <div className="tabs practice-tabs" role="tablist" aria-label={t("Practicar")}>
            {(["machines", "path", "ranking"] as const).map(item => (
              <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => useView.setState({ tab: item })}>
                {item === "machines" ? t("Máquinas") : item === "path" ? t("Camino") : t("Ranking")}
              </button>
            ))}
          </div>
          <DifficultyPicker compact />
        </div>
        {tab === "machines" ? <MachinesView /> : tab === "ranking" ? <Rankings /> : (
          <ol className="roadmap">
            {BOXES.map((box, i) => <BoxStep key={box.id} box={box} step={i + 1} difficulty={difficulty} />)}
          </ol>
        )}
      </div>
    </main>
  );
}
