// Practice, in the manner of a hacking lab: five sections, reached from the
// app's side menu (app/Sidebar), which also shows the player and the season.
// The Starting Point: four tiers from reading to playing. The machines: the exercises, each with a name to
// remember, a story, an avatar, a level, a time and the points (XP) it gives,
// twice from the CLI, as a table to search and filter; a machine opens its
// page (play it, what it is about, its solution once solved). The tracks:
// curated paths through the machines. The seasons: sets of new machines
// around a theme, each with its ranking. And the ranking.
import {
  BOXES, BOX_COLOR, EXERCISES, LEVEL_LABEL, listedExercises, nextExercise, protocolById, solvedKey, TIME_LIMIT, xpOf, type Exercise,
} from "@visual-tracert/model";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "../editor/icons";
import { tx, useT } from "../i18n";
import { BackButton, DifficultyPicker, MachineTable, Meter, PlayButton, SectionHead, Solves, useMachineState, useView } from "./common";
import { MachineAvatar } from "./MachineAvatar";
import { clock, useProgress } from "./progress";
import { Rankings } from "./Rankings";
import { Seasons } from "./Seasons";
import { fileUrl, useShared } from "./server";
import { ProtocolPage, ProtocolTags } from "./Protocols";
import { Blocks } from "./blocks";
import { useBook } from "./guides";
import { StartingPoint } from "./StartingPoint";
import { Tracks } from "./Tracks";


type Shown = "all" | "todo" | "solved";

/** the next machine of the path, to start from */
function NextMachine() {
  const t = useT();
  const done = useProgress(state => state.done);
  const difficulty = useProgress(state => state.difficulty);
  const next = nextExercise(done, difficulty);
  if(!next) return null;
  const solved = Object.keys(done).length > 0;
  return (
    <button type="button" className="featured next-machine" onClick={() => useView.setState({ machine: next.id })}>
      <MachineAvatar exercise={next} size={56} />
      <div>
        <span className="featured-tag">{solved ? t("Siguiente en tu camino") : t("Empieza aquí")}</span>
        <strong>{t(next.codename)}</strong>
        <span className="mono small muted">{t(LEVEL_LABEL[next.level])} · {t(BOXES.find(box => box.id === next.box)!.title)}</span>
      </div>
      <Icon name="chevron" size={18} />
    </button>
  );
}

// --- the machines: a table to search and filter -----------------------------

function MachinesView() {
  const t = useT();
  const done = useProgress(state => state.done);
  const difficulty = useProgress(state => state.difficulty);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const [topic, setTopic] = useState("");
  const [shown, setShown] = useState<Shown>("all");
  const words = query.trim().toLowerCase();
  const list = listedExercises().filter(exercise => {
    const box = BOXES.find(item => item.id === exercise.box)!;
    const solved = Boolean(done[solvedKey(exercise.id, difficulty)]);
    return (!words || [exercise.codename, exercise.title, exercise.story, box.title].some(text => t(text).toLowerCase().includes(words)))
      && (!level || String(exercise.level) === level)
      && (!topic || exercise.box === topic)
      && (shown === "all" || (shown === "solved") === solved);
  });
  return (
    <>
      <SectionHead icon="topology" title={t("Máquinas")} lead={t("Cada máquina es un laboratorio con algo roto o por hacer. Supéralas en Fácil, desde la interfaz, o en Medio, solo con la CLI de equipos reales.")}>
        <DifficultyPicker compact />
      </SectionHead>
      <NextMachine />
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
      <MachineTable exercises={list} />
      {!list.length && <p className="muted small machine-empty">{t("Ninguna máquina con esos filtros.")}</p>}
    </>
  );
}


// --- a machine's page --------------------------------------------------------

/** what may spoil a machine (its walkthrough, its solution): blurred until asked for */
function Spoiler({ solved, what, children }: { solved: boolean; what: string; children: ReactNode }) {
  const t = useT();
  const [shown, setShown] = useState(false);
  return (
    <div className={`spoiler${shown ? " shown" : ""}`}>
      <div className="spoiler-content" aria-hidden={!shown} inert={!shown}>{children}</div>
      {!shown && (
        <div className="spoiler-cover">
          <Icon name="lock" size={26} />
          <strong>{t("Oculto para no hacerte spoiler")}</strong>
          <span className="muted small">{solved ? t("Ya superaste esta máquina: puedes verlo sin problema.") : t("Aún no la has superado. Prueba antes con las pistas de la tarjeta del reto.")}</span>
          <button type="button" className={solved ? "primary" : "ghost"} onClick={() => setShown(true)}>{t("Mostrar {what}", { what })}</button>
        </div>
      )}
      {shown && <button type="button" className="ghost small spoiler-hide" onClick={() => setShown(false)}>{t("Ocultar de nuevo")}</button>}
    </div>
  );
}

function MachinePage({ exercise }: { exercise: Exercise }) {
  const t = useT();
  const state = useMachineState(exercise);
  const [tab, setTab] = useState<"play" | "info" | "walkthrough" | "solution">("play");
  const walkthrough = useBook()?.walkthroughs[exercise.id];
  const box = BOXES.find(item => item.id === exercise.box)!;
  const lab = useMemo(() => exercise.build(t), [exercise, t]);
  const first = useShared(item => item.figures[exercise.id]?.[state.difficulty]?.first);
  const tabs = [
    { id: "play" as const, label: tx("Jugar") },
    { id: "info" as const, label: tx("Información") },
    { id: "walkthrough" as const, label: tx("Walkthrough") },
    { id: "solution" as const, label: tx("Solución") },
  ];
  return (
    <div className="machine-page" style={{ "--box": BOX_COLOR[exercise.box] } as CSSProperties}>
      <header className="machine-banner">
        <BackButton label={t("Todas las máquinas")} onClick={() => useView.setState({ machine: null })} />
        <div className="machine-hero">
          <MachineAvatar exercise={exercise} size={104} solved={state.solved} />
          <div className="machine-title">
            <h1>{t(exercise.codename)}</h1>
            <span className="mono muted">{t(LEVEL_LABEL[exercise.level])} · {t(box.title)}</span>
            <p className="small">{t(exercise.title)}</p>
            <ProtocolTags ids={exercise.protocols} />
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
            {t(item.label)}
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
        {tab === "walkthrough" && (
          <Spoiler solved={state.solvedAny} what={t("el walkthrough")}>
            <p className="muted small">{t("Cómo resolverla paso a paso, en los dos modos, y por qué funciona.")}</p>
            {exercise.pdf && (
              <div className="walkthrough-pdf">
                <a className="primary small button-link" href={fileUrl(exercise.pdf)} target="_blank" rel="noreferrer noopener"><Icon name="file" size={15} />{t("Abrir el walkthrough en PDF")}</a>
                <iframe title={t("Walkthrough en PDF")} src={fileUrl(exercise.pdf)} />
              </div>
            )}
            <div className="guide-section walkthrough">{walkthrough ? <Blocks blocks={walkthrough} /> : exercise.custom ? null : <p className="muted small">{t("Cargando…")}</p>}</div>
            {exercise.custom && !exercise.pdf && <p className="muted small">{t("Esta máquina aún no tiene walkthrough: mira su solución.")}</p>}
          </Spoiler>
        )}
        {tab === "solution" && (
          <Spoiler solved={state.solvedAny} what={t("la solución")}>
            <p className="muted small">{t("Así lo resuelve la solución de referencia. Si lo hiciste de otra forma y «Comprobar» pasó, también es correcta.")}</p>
            <h3>{t("Desde la interfaz")}</h3>
            <ol className="machine-solution">{exercise.hints.map(hint => <li key={hint}>{t(hint)}</li>)}</ol>
            {exercise.cli && (
              <>
                <h3>{t("Desde la CLI")}</h3>
                <ol className="machine-solution mono">{exercise.cli.map(hint => <li key={hint}>{t(hint)}</li>)}</ol>
              </>
            )}
          </Spoiler>
        )}
      </div>
    </div>
  );
}


// --- practice ----------------------------------------------------------------

export function PracticeHub() {
  const { section, machine, protocol } = useView();
  const open = machine ? EXERCISES.find(item => item.id === machine) : undefined;
  const page = protocol ? protocolById(protocol) : undefined;
  // the admins' changes to the machines: drawn again when they come
  const version = useShared(state => state.machinesVersion);
  useEffect(() => { void useShared.getState().refreshFigures(); void useShared.getState().refreshSeasons(); void useShared.getState().refreshMachines(); }, []);
  return (
    <main className="practice">
      <div className="practice-main">
        <div className="practice-inner" key={`${version}:${page ? `protocol:${page.id}` : open ? open.id : section}`}>
          {page ? <ProtocolPage protocol={page} />
            : open ? <MachinePage exercise={open} />
            : section === "start" ? <StartingPoint />
            : section === "machines" ? <MachinesView />
            : section === "tracks" ? <Tracks />
            : section === "seasons" ? <Seasons />
            : <RankingSection />}
        </div>
      </div>
    </main>
  );
}

function RankingSection() {
  const t = useT();
  return (
    <>
      <SectionHead icon="trophy" title={t("Ranking")} lead={t("Los jugadores por XP; a igualdad, quien llegó antes. Las máquinas en Medio las comprueba el servidor en los equipos reales.")} />
      <Rankings />
    </>
  );
}
