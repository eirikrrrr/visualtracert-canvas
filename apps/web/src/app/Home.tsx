// The home page: where the app opens, and where its logo leads. The player at
// a glance — their rank and level, the season running and their place in it,
// their weekly streak and the XP of the last weeks — then the machines for
// them, what they have in progress, their Starting Point, the latest news and
// the ways into the rest of the app (practice, simulation, emulation).
import {
  BOX_COLOR, exerciseById, LEVEL_LABEL, listedExercises, nextExercise, playableExercises, rankOf, solvedKey, TIERS, xpOf,
  type Difficulty, type Exercise, type Solved,
} from "@visual-tracert/model";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Icon } from "../editor/icons";
import { tx, useLang, useT, LANGS } from "../i18n";
import { Avatar } from "../panels/TopBar";
import { useView, type Section } from "../practice/common";
import { useGuides } from "../practice/guides";
import { MachineAvatar } from "../practice/MachineAvatar";
import { chooseMode, clock, resumeExercise, useProgress } from "../practice/progress";
import { practiceApi, useShared } from "../practice/server";
import { useCurrentSeason } from "../practice/Seasons";
import { useAuth } from "./auth";
import { useProfile } from "./profile";
import { useStore } from "./store";

const WEEK = 7 * 24 * 60 * 60 * 1000;
/** the XP a week asks for, to keep the streak meaningful */
const WEEKLY_GOAL = 100;
/** a week's number, the weeks starting on Monday */
const weekOf = (time: number) => Math.floor((time - 4 * 24 * 60 * 60 * 1000) / WEEK);

/** what was solved: its exercise, difficulty, when, and the XP it gave */
function solves(done: Solved): { exercise: Exercise; difficulty: Difficulty; at: number; xp: number }[] {
  return Object.entries(done).flatMap(([key, at]) => {
    const [id, medium] = key.split(":");
    const exercise = exerciseById(id);
    const difficulty: Difficulty = medium === "medium" ? "medium" : "easy";
    return exercise ? [{ exercise, difficulty, at, xp: xpOf(exercise, difficulty) }] : [];
  });
}

/** the weeks in a row with something solved (this one, or up to the last), the best run, this week's XP and the last weeks' */
function streakOf(done: Solved, weeks = 6) {
  const list = solves(done);
  const active = new Set(list.map(item => weekOf(item.at)));
  const now = weekOf(Date.now());
  let current = 0;
  for(let week = active.has(now) ? now : now - 1; active.has(week); week--) current++;
  let best = 0, run = 0, last = -Infinity;
  for(const week of [...active].sort((p, q) => p - q)){
    run = week === last + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    last = week;
  }
  const trend = Array.from({ length: weeks }, (_, i) => {
    const week = now - (weeks - 1 - i);
    return { week, xp: list.filter(item => weekOf(item.at) === week).reduce((sum, item) => sum + item.xp, 0) };
  });
  return { current, best, thisWeek: trend[weeks - 1].xp, trend };
}

/** opens a section of practice (and a machine in it) */
function openPractice(section: Section, machine?: string) {
  chooseMode("practice");
  useView.setState({ section, machine: machine ?? null, track: null, season: null, protocol: null });
}

function LevelCard() {
  const t = useT();
  const done = useProgress(state => state.done);
  const rank = rankOf(done);
  const solved = Object.keys(done).length;
  const machines = playableExercises("easy").length + playableExercises("medium").length;
  return (
    <section className="home-card home-level">
      <div className="home-level-art" aria-hidden="true">
        <span className="home-badge"><Icon name="practice" size={64} /></span>
        <span className="home-level-n"><small>{t("Nivel")}</small> {rank.level}</span>
      </div>
      <div className="home-meter">
        <span>{t("XP")}</span>
        <span className="mono small">{rank.next ? `${rank.xp}/${rank.next.from}` : rank.xp}</span>
      </div>
      <span className="player-bar"><i style={{ width: `${rank.progress * 100}%` }} /></span>
      <div className="home-stats">
        <div><strong>{t(rank.rank)}</strong><span>{t("Rango")}</span></div>
        <div><strong>{solved}/{machines}</strong><span>{t("Máquinas superadas")}</span></div>
      </div>
    </section>
  );
}

function SeasonPanel() {
  const t = useT();
  const season = useCurrentSeason();
  const [me, setMe] = useState<{ position: number; xp: number } | null>(null);
  useEffect(() => {
    if(!season) return;
    let live = true;
    void practiceApi.ranking(season.id).then(ranking => { if(live) setMe(ranking.me); }).catch(() => undefined);
    return () => { live = false; };
  }, [season]);
  if(!season){
    return (
      <section className="home-card home-season empty">
        <span className="home-season-icon" aria-hidden="true"><Icon name="calendar" size={46} /></span>
        <strong>{t("Sin season en curso")}</strong>
        <span className="muted small">{t("Cuando empiece una, verás aquí tu puesto. Mientras, el ranking global cuenta todo lo que superes.")}</span>
        <button type="button" className="ghost small" onClick={() => openPractice("ranking")}>{t("Ver el ranking")}</button>
      </section>
    );
  }
  const solved = season.machines.filter(id => useProgress.getState().done[solvedKey(id)] || useProgress.getState().done[solvedKey(id, "medium")]).length;
  return (
    <section className="home-card home-season" style={{ "--season": season.color } as CSSProperties}>
      <span className="home-chip">{season.name}</span>
      <span className="home-season-icon" aria-hidden="true"><Icon name={season.icon} size={46} /></span>
      <span className="tag">{me ? t("Puesto #{n}", { n: me.position }) : t("Sin puesto aún")}</span>
      <span className="muted small">{season.theme}</span>
      <div className="home-stats">
        <div><strong>{me ? me.xp : "—"}</strong><span>{t("XP de la season")}</span></div>
        <div><strong>{solved}/{season.machines.length}</strong><span>{t("Máquinas")}</span></div>
      </div>
      <button type="button" className="ghost small" onClick={() => openPractice("seasons")}>{t("Abrir la season")}</button>
    </section>
  );
}

/** the streak's flame */
const Flame = () => (
  <svg className="home-flame" width="30" height="34" viewBox="0 0 24 28" aria-hidden="true">
    <path d="M12 1c1 4.5 6.5 7.3 6.5 14A6.5 6.5 0 0 1 12 27a6.5 6.5 0 0 1-6.5-6.5c0-3.5 2-5.5 3.3-7.7.4 2 1.4 3.2 2.7 3.7C11 12 10.4 6 12 1z" fill="#ff5d3a" />
    <path d="M12 14c.6 2.4 3.4 3.8 3.4 7.2a3.4 3.4 0 0 1-6.8 0c0-1.8 1-3 1.9-4 .3 1 .8 1.6 1.5 1.8-.3-1.7-.5-3.4 0-5z" fill="#ffc23d" />
  </svg>
);

function StreakPanel() {
  const t = useT();
  const done = useProgress(state => state.done);
  const streak = useMemo(() => streakOf(done), [done]);
  const top = Math.max(WEEKLY_GOAL, ...streak.trend.map(item => item.xp));
  return (
    <div className="home-column">
      <section className="home-card home-streak">
        <h3>{t("Racha semanal")}</h3>
        <div className="home-streak-n"><Flame /><strong>{t("{n} semanas", { n: streak.current })}</strong></div>
        <div className="home-meter"><span>{t("XP esta semana")}</span><span className="mono small">{streak.thisWeek}/{WEEKLY_GOAL}</span></div>
        <span className="player-bar"><i style={{ width: `${Math.min(1, streak.thisWeek / WEEKLY_GOAL) * 100}%` }} /></span>
        <span className="muted small">{t("Supera al menos una máquina cada semana para mantener la racha. Mejor racha: {n} semanas.", { n: streak.best })}</span>
      </section>
      <section className="home-card home-trend">
        <h3>{t("XP de las últimas semanas")}</h3>
        <div className="home-bars" role="img" aria-label={streak.trend.map(item => `${item.xp} XP`).join(", ")}>
          {streak.trend.map((item, i) => (
            <span key={item.week} className={i === streak.trend.length - 1 ? "now" : ""} title={`${item.xp} XP`}>
              <i style={{ height: `${Math.max(3, item.xp / top * 100)}%` }} />
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function MachineTile({ exercise, difficulty, note, onOpen }: { exercise: Exercise; difficulty: Difficulty; note?: string; onOpen: () => void }) {
  const t = useT();
  return (
    <button type="button" className="home-machine" style={{ "--box": BOX_COLOR[exercise.box] } as CSSProperties} onClick={onOpen}>
      <span className="home-machine-art"><MachineAvatar exercise={exercise} size={84} /></span>
      <strong>{t(exercise.codename)}</strong>
      <span className="mono small muted">{t(LEVEL_LABEL[exercise.level])} · {difficulty === "medium" ? t("Medio") : t("Fácil")}</span>
      <span className="small">{note ?? `+${xpOf(exercise, difficulty)} XP`}</span>
    </button>
  );
}

function ForYou() {
  const t = useT();
  const done = useProgress(state => state.done);
  const difficulty = useProgress(state => state.difficulty);
  const labs = useProgress(state => state.labs);
  useShared(state => state.machinesVersion);
  const [tab, setTab] = useState<"for-you" | "progress">("for-you");
  const next = nextExercise(done, difficulty);
  const picks = [next, ...listedExercises().filter(item => item !== next && !done[solvedKey(item.id, difficulty)] && (difficulty === "easy" || item.cli))]
    .filter((item): item is Exercise => Boolean(item)).slice(0, 4);
  const running = Object.entries(labs).filter(([, attempt]) => attempt.solvedIn === undefined && !attempt.expired)
    .map(([lab, attempt]) => ({ lab, attempt, exercise: exerciseById(attempt.exercise) })).filter(item => item.exercise);
  return (
    <section className="home-card home-picks">
      <div className="home-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "for-you"} className={tab === "for-you" ? "active" : ""} onClick={() => setTab("for-you")}>{t("Para ti")}</button>
        <button type="button" role="tab" aria-selected={tab === "progress"} className={tab === "progress" ? "active" : ""} onClick={() => setTab("progress")}>
          {t("En curso")}{running.length > 0 && <span className="tag">{running.length}</span>}
        </button>
      </div>
      {tab === "for-you" ? (
        picks.length ? <div className="home-machines">{picks.map((item, i) => (
          <MachineTile key={item.id} exercise={item} difficulty={difficulty} note={i === 0 && item === next ? t("Siguiente del camino · +{n} XP", { n: xpOf(item, difficulty) }) : undefined}
            onOpen={() => openPractice("machines", item.id)} />
        ))}</div> : <p className="muted small">{t("¡Has superado todas las máquinas en este modo! Prueba el otro modo o espera a la próxima season.")}</p>
      ) : (
        running.length ? <div className="home-machines">{running.map(({ lab, attempt, exercise }) => (
          <MachineTile key={lab} exercise={exercise!} difficulty={attempt.difficulty}
            note={attempt.deadline ? t("Quedan {time}", { time: clock(Math.max(0, attempt.deadline - Date.now())) }) : t("Continuar")}
            onOpen={() => resumeExercise(lab)} />
        ))}</div> : <p className="muted small">{t("No tienes ninguna máquina a medias. Empieza una desde «Para ti».")}</p>
      )}
    </section>
  );
}

function StartingPointCard() {
  const t = useT();
  const guides = useGuides();
  const lessons = useProgress(state => state.lessons);
  return (
    <section className="home-card home-start">
      <h3>{t("Tu Starting Point")}</h3>
      <ul>
        {TIERS.filter(tier => tier.guide).map(tier => {
          const sections = guides?.[tier.guide!].sections ?? [];
          const read = sections.filter(section => lessons[`${tier.guide}/${section.id}`]).length;
          const passed = Boolean(lessons[`quiz:${tier.guide}`]);
          const percent = sections.length ? Math.round((read + (passed ? 1 : 0)) / (sections.length + 1) * 100) : 0;
          return (
            <li key={tier.id}>
              <button type="button" onClick={() => { openPractice("start"); useView.setState({ tier: tier.number }); }}>
                <span>{t("Nivel {n} · {title}", { n: tier.number, title: t(tier.title) })}</span>
                <span className="player-bar"><i style={{ width: `${percent}%` }} /></span>
                <span className="mono small">{passed ? <Icon name="check" size={13} /> : `${percent}%`}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const NEWS: { date: string; title: string; text: string; icon: string }[] = [
  { date: "2026-11-01", icon: "emulation", title: tx("Todas las máquinas, también en Medio"), text: tx("DHCP, DNS, relay y web ya funcionan en los equipos reales: las doce máquinas se pueden jugar desde la CLI.") },
  { date: "2026-11-01", icon: "book", title: tx("Starting Point con guías completas"), text: tx("Tres guías con diagramas, documentos de referencia y un quiz final por nivel, en español, inglés y portugués.") },
  { date: "2026-11-01", icon: "layers", title: tx("Páginas de protocolos y walkthroughs"), text: tx("Cada máquina enlaza a los protocolos que usa y trae su walkthrough, oculto hasta que lo pidas.") },
  { date: "2026-10-31", icon: "trophy", title: tx("Ranking y seasons"), text: tx("Los retos en Medio los comprueba el servidor, y cada season tiene su propio ranking.") },
];

function NewsCard() {
  const t = useT();
  const lang = useLang(state => state.lang);
  const locale = LANGS.find(item => item.id === lang)!.html;
  return (
    <section className="home-card home-news">
      <h3>{t("Novedades")}</h3>
      <ul>
        {NEWS.map(item => (
          <li key={item.title}>
            <span className="home-news-icon" aria-hidden="true"><Icon name={item.icon} size={18} /></span>
            <div>
              <strong>{t(item.title)}</strong>
              <span className="muted small">{t(item.text)}</span>
              <span className="mono small muted">{new Date(`${item.date}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Shortcuts() {
  const t = useT();
  const items: { icon: string; title: string; text: string; go: () => void }[] = [
    { icon: "practice", title: tx("Practicar"), text: tx("Máquinas, tracks, seasons y ranking"), go: () => openPractice("machines") },
    { icon: "simulation", title: tx("Simulación"), text: tx("Diseña una red y mira cada paquete en el lienzo"), go: () => chooseMode("simulation") },
    { icon: "emulation", title: tx("Emulación"), text: tx("Equipos reales en contenedores, con su CLI"), go: () => chooseMode("emulation") },
  ];
  return (
    <div className="home-shortcuts">
      {items.map(item => (
        <button key={item.title} type="button" onClick={item.go}>
          <span className="home-news-icon" aria-hidden="true"><Icon name={item.icon} size={20} /></span>
          <span><strong>{t(item.title)}</strong><span className="muted small">{t(item.text)}</span></span>
          <Icon name="next" size={16} />
        </button>
      ))}
    </div>
  );
}

export function Home() {
  const t = useT();
  const user = useAuth(state => state.user);
  const name = useProfile(state => state.name);
  const done = useProgress(state => state.done);
  useEffect(() => { void useShared.getState().refreshSeasons(); }, []);
  return (
    <main className="home">
      <div className="home-inner">
        <header className="home-head">
          <Avatar size={72} />
          <div>
            <h1>{name || user?.name}{user && <span className="muted"> @{user.username}</span>}</h1>
            <span className="tag">{t(rankOf(done).rank)}</span>
          </div>
          <button type="button" className="ghost" onClick={() => useStore.getState().setDashboard("profile")}>{t("Ver perfil")}</button>
        </header>
        <div className="home-top">
          <LevelCard />
          <SeasonPanel />
          <StreakPanel />
        </div>
        <ForYou />
        <div className="home-bottom">
          <div className="home-column">
            <StartingPointCard />
            <Shortcuts />
          </div>
          <NewsCard />
        </div>
      </div>
    </main>
  );
}
