// The challenge of a lab opened for an exercise: a card fixed on the canvas's
// left, with what to do, its time left, its goals (checked on demand: in the
// simulation, or on the real devices in medium difficulty) and hints one at a
// time. Solved: the time it took, the reference solution and the next
// exercise of the path, its containers closed. A medium one is checked by the
// server, on the devices: so it counts for the ranking. Out of time: its containers
// closed, and a new attempt to start. It folds to its title (the time stays).
import { BOXES, DIFFICULTY_LABEL, exerciseById, LEVEL_LABEL, nextExercise, solvedKey } from "@visual-tracert/model";
import { useEffect, useState } from "react";
import { useStore } from "../app/store";
import { Icon } from "../editor/icons";
import { useEmulation } from "../emulation/store";
import { useT } from "../i18n";
import { checkGoals, type GoalResult } from "./check";
import { MachineAvatar } from "./MachineAvatar";
import { clock, finishAttempt, startExercise, stopExerciseLabs, useProgress } from "./progress";
import { practiceApi, type Solve } from "./server";

/** the time now, once a second while it is wanted */
function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if(!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function ChallengeCard() {
  const t = useT();
  const labId = useStore(state => state.labId);
  const topology = useStore(state => state.topology);
  const linked = useProgress(state => state.labs[labId]);
  const done = useProgress(state => state.done);
  const lab = useEmulation(state => state.lab);
  const busy = useEmulation(state => state.busy);
  const [results, setResults] = useState<{ topology: typeof topology; list: GoalResult[] } | null>(null);
  const [checking, setChecking] = useState(false);
  const [hints, setHints] = useState(0);
  const [folded, setFolded] = useState(false);
  // another lab, another challenge
  useEffect(() => { setResults(null); setHints(0); setFolded(false); setChecking(false); }, [labId]);
  const finished = linked?.solvedIn !== undefined;
  const now = useNow(Boolean(linked?.deadline) && !finished && !linked?.expired);
  const exercise = linked ? exerciseById(linked.exercise) : undefined;
  if(!linked || !exercise) return null;

  const medium = linked.difficulty === "medium";
  const deployed = Boolean(lab?.deployed && lab.lab === labId);
  const box = BOXES.find(item => item.id === exercise.box);
  const hintList = medium ? exercise.cli ?? [] : exercise.hints;
  const left = linked.deadline ? linked.deadline - now : null;
  const expired = !finished && (linked.expired || (left !== null && left <= 0));
  // easy: a result goes stale when the lab changes; medium: the lab cannot change
  const stale = !finished && !medium && results !== null && results.topology !== topology;
  const solved = finished || (!stale && (results?.list.every(result => result.ok) ?? false));
  const next = solved ? nextExercise(done, linked.difficulty) : undefined;
  const check = async () => {
    setChecking(true);
    let list: GoalResult[];
    let server: Solve | undefined;
    if(medium){
      // the server checks it on the devices (and counts it for the ranking)
      try{
        const verdict = await practiceApi.checkMedium(exercise.id, labId);
        list = verdict.results ?? exercise.goals.map(() => ({ ok: verdict.ok, detail: "" }));
        server = verdict.solve;
      }catch(error){
        list = exercise.goals.map(() => ({ ok: false, detail: (error as Error).message }));
      }
    }else list = checkGoals(topology, exercise.goals, t);
    setResults({ topology, list });
    setChecking(false);
    // solved: its time kept and, from the CLI, its containers closed
    if(list.every(result => result.ok)) finishAttempt(labId, solvedKey(exercise.id, linked.difficulty), server);
  };

  const timer = finished
    ? <span className="challenge-time done" title={t("Tiempo empleado")}><Icon name="check" size={12} />{clock(linked.solvedIn!)}</span>
    : expired ? <span className="challenge-time over">{t("Tiempo agotado")}</span>
    : left !== null ? <span className={`challenge-time${left <= 60_000 ? " warn" : ""}`} title={t("Tiempo que queda")} role="timer"><Icon name="realtime" size={12} />{clock(left)}</span>
    : null;

  return (
    <aside className={`challenge${folded ? " folded" : ""}${solved ? " solved" : ""}${expired ? " expired" : ""}`} aria-label={t("Reto: {title}", { title: t(exercise.title) })}>
      <header className="challenge-head">
        <MachineAvatar exercise={exercise} size={44} solved={solved} />
        <div className="challenge-head-text">
          <span className="challenge-kicker">{t("Reto")} · {box ? t(box.title) : ""} · {t(LEVEL_LABEL[exercise.level])}</span>
          <h2>{t(exercise.codename)}</h2>
          <span className="small muted">{t(exercise.title)}</span>
          <div className="challenge-meta">
            <span className={`tag difficulty-tag${medium ? " medium" : ""}`}>{t(DIFFICULTY_LABEL[linked.difficulty])}</span>
            {timer}
          </div>
        </div>
        <div className="challenge-head-end">
          <button type="button" className="icon-button" aria-expanded={!folded} aria-label={folded ? t("Desplegar el reto") : t("Plegar el reto")}
            title={folded ? t("Desplegar el reto") : t("Plegar el reto")} onClick={() => setFolded(!folded)}>
            <Icon name="chevron" size={16} />
          </button>
        </div>
      </header>
      {!folded && (
        <div className="challenge-body">
          <p className="small">{t(exercise.summary)}</p>
          {medium && !solved && !expired && (
            <p className="emu-note small">{t("Modo Medio: configura cada equipo desde su CLI (doble clic en él → CLI). La interfaz y el documento están bloqueados; reiniciar un equipo borra lo que hiciste en su CLI.")}</p>
          )}
          <h3>{t("Objetivos")}</h3>
          <ol className="challenge-goals">
            {exercise.goals.map((goal, i) => {
              const result = results?.list[i];
              const state = finished || result?.ok ? "ok" : result ? "fail" : "pending";
              return (
                <li key={goal.text} className={`goal-${state}${stale ? " stale" : ""}`}>
                  <span className="goal-mark" aria-hidden="true">{state === "ok" ? <Icon name="check" size={13} /> : state === "fail" ? <Icon name="close" size={12} /> : null}</span>
                  <div>
                    <span>{t(goal.text)}</span>
                    {result && <small className="muted">{result.detail}</small>}
                  </div>
                </li>
              );
            })}
          </ol>
          {stale && <p className="emu-note small">{t("Cambiaste el laboratorio desde la última comprobación: vuelve a comprobar.")}</p>}
          {solved ? (
            <div className="challenge-done" role="status">
              <strong>{t("¡Reto superado!")}</strong>
              {linked.solvedIn !== undefined && linked.startedAt && (
                <span className="small">{t("En {time}.", { time: clock(linked.solvedIn) })}{medium ? ` ${t("Sus contenedores se cerraron.")}` : ""}</span>
              )}
              {/* every hint, as the reference solution: another way that passes is right too */}
              <div className="challenge-solution">
                <span className="small">{t("Así lo resuelve la solución de referencia. Si lo hiciste de otra forma y «Comprobar» pasó, también es correcta.")}</span>
                <ol>{hintList.map(hint => <li key={hint} className="small">{t(hint)}</li>)}</ol>
              </div>
              <div className="challenge-actions">
                {next && <button type="button" className="primary small" onClick={() => void startExercise(next.id, linked.difficulty)}>{t("Siguiente: {title}", { title: t(next.title) })}</button>}
                <button type="button" className="ghost small" onClick={() => { void stopExerciseLabs(); useStore.getState().setMode("practice"); }}>{t("Volver a Practicar")}</button>
              </div>
            </div>
          ) : expired ? (
            <div className="challenge-over" role="status">
              <strong>{t("Se acabó el tiempo")}</strong>
              <span className="small">{medium ? t("Sus contenedores se cerraron. Vuelve a intentarlo: el reto empieza de cero, con su tiempo.") : t("Vuelve a intentarlo: el reto empieza de cero, con su tiempo.")}</span>
              <div className="challenge-actions">
                <button type="button" className="primary small" onClick={() => void startExercise(exercise.id, linked.difficulty)}>
                  <Icon name="restart" size={14} />{t("Reintentar")}
                </button>
                <button type="button" className="ghost small" onClick={() => useStore.getState().setMode("practice")}>{t("Volver a Practicar")}</button>
              </div>
            </div>
          ) : medium && !deployed ? (
            <div className="challenge-actions">
              <button type="button" className="primary small" disabled={busy !== null} onClick={() => useEmulation.getState().deploy(labId, topology, linked.deadline)}>
                <Icon name="play" size={14} />{busy === "deploy" ? t("Iniciando…") : t("Iniciar el laboratorio")}
              </button>
            </div>
          ) : (
            <div className="challenge-actions">
              <button type="button" className={`primary small${checking ? " spinning" : ""}`} disabled={checking} onClick={() => void check()}>
                <Icon name={checking ? "restart" : "check"} size={14} />{checking ? t("Comprobando…") : t("Comprobar")}
              </button>
              {hints < hintList.length && (
                <button type="button" className="ghost small" onClick={() => setHints(hints + 1)}>
                  {t("Pista ({n} de {total})", { n: hints + 1, total: hintList.length })}
                </button>
              )}
            </div>
          )}
          {hints > 0 && !solved && !expired && (
            <ul className="challenge-hints">
              {hintList.slice(0, hints).map(hint => <li key={hint} className="small">{t(hint)}</li>)}
            </ul>
          )}
          <button type="button" className="link small challenge-back" onClick={() => useStore.getState().setMode("practice")}>← {t("Todos los retos")}</button>
        </div>
      )}
    </aside>
  );
}
