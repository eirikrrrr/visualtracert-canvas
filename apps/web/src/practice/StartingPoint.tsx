// The Starting Point: four tiers for a beginner, from reading to playing.
// Fundamentals and concepts are short lessons, each done by answering its
// question right; references are sheets to come back to (done once opened);
// the last tier is the first machine of each topic. Each tier says what it is,
// the skills it gives and how far the user is; a lesson or a sheet opens in
// its place, with the way back.
import { exerciseById, solvedKey, TIERS, type Lesson, type Reference, type Tier } from "@visual-tracert/model";
import { useState } from "react";
import { Icon } from "../editor/icons";
import { useT } from "../i18n";
import { MachineTable, useView } from "./common";
import { useProgress } from "./progress";

/** what of a tier is done, of how much */
export function useTierProgress(tier: Tier): { done: number; total: number } {
  const lessons = useProgress(state => state.lessons);
  const solved = useProgress(state => state.done);
  const items = [...(tier.lessons ?? []).map(item => item.id), ...(tier.references ?? []).map(item => `ref:${item.id}`)];
  const machines = tier.machines ?? [];
  const done = items.filter(id => lessons[id]).length
    + machines.filter(id => solved[solvedKey(id, "easy")] || solved[solvedKey(id, "medium")]).length;
  return { done, total: items.length + machines.length };
}

function LessonView({ lesson, next, back, onNext }: { lesson: Lesson; next?: Lesson; back: () => void; onNext: () => void }) {
  const t = useT();
  const done = useProgress(state => Boolean(state.lessons[lesson.id]));
  const [chosen, setChosen] = useState<number | null>(null);
  const right = chosen === lesson.question.answer;
  return (
    <article className="lesson">
      <button type="button" className="ghost small machine-back" onClick={back}>← {t("Volver al nivel")}</button>
      <header className="lesson-head">
        <span className="section-icon" aria-hidden="true"><Icon name={lesson.icon} size={22} /></span>
        <div>
          <h2>{t(lesson.title)}</h2>
          <span className="muted small">{t("{n} min de lectura", { n: lesson.minutes })}{done ? ` · ${t("Hecha")}` : ""}</span>
        </div>
      </header>
      <div className="lesson-body">{lesson.body.map(paragraph => <p key={paragraph}>{t(paragraph)}</p>)}</div>
      <section className="lesson-question" aria-labelledby={`q-${lesson.id}`}>
        <h3 id={`q-${lesson.id}`}>{t("Comprueba lo que sabes")}</h3>
        <p>{t(lesson.question.text)}</p>
        <div className="lesson-options" role="radiogroup">
          {lesson.question.options.map((option, i) => (
            <button key={option} type="button" role="radio" aria-checked={chosen === i}
              className={chosen === i ? (right ? "right" : "wrong") : ""} disabled={right}
              onClick={() => { setChosen(i); if(i === lesson.question.answer) useProgress.getState().learn(lesson.id); }}>
              <span className="lesson-letter">{String.fromCharCode(65 + i)}</span>{t(option)}
            </button>
          ))}
        </div>
        {chosen !== null && (right ? (
          <div className="challenge-done" role="status">
            <strong>{t("¡Correcto!")}</strong>
            <span className="small">{t(lesson.question.why)}</span>
            <div className="challenge-actions">
              {next
                ? <button type="button" className="primary small" onClick={onNext}>{t("Siguiente: {title}", { title: t(next.title) })}</button>
                : <button type="button" className="primary small" onClick={back}>{t("Volver al nivel")}</button>}
            </div>
          </div>
        ) : <p className="emu-note small" role="status">{t("No es esa. Vuelve a leer el texto y prueba otra.")}</p>)}
      </section>
    </article>
  );
}

function ReferenceView({ sheet, back }: { sheet: Reference; back: () => void }) {
  const t = useT();
  return (
    <article className="lesson">
      <button type="button" className="ghost small machine-back" onClick={back}>← {t("Volver al nivel")}</button>
      <header className="lesson-head">
        <span className="section-icon" aria-hidden="true"><Icon name={sheet.icon} size={22} /></span>
        <div><h2>{t(sheet.title)}</h2><span className="muted small">{t(sheet.summary)}</span></div>
      </header>
      <div className="machine-table-wrap">
        <table className="machine-table reference-table">
          <thead><tr><th>{t(sheet.columns[0])}</th><th>{t(sheet.columns[1])}</th></tr></thead>
          <tbody>{sheet.rows.map(([term, meaning]) => <tr key={term}><td className="mono">{term}</td><td>{t(meaning)}</td></tr>)}</tbody>
        </table>
      </div>
    </article>
  );
}

function TierItem({ icon, title, meta, done, onOpen }: { icon: string; title: string; meta: string; done: boolean; onOpen: () => void }) {
  const t = useT();
  return (
    <li>
      <button type="button" className={`tier-item${done ? " done" : ""}`} onClick={onOpen}>
        <span className="tier-item-icon" aria-hidden="true"><Icon name={done ? "check" : icon} size={18} /></span>
        <span className="tier-item-text"><strong>{title}</strong><span className="muted small">{meta}</span></span>
        <span className={`tag${done ? " tag-images" : ""}`}>{done ? t("Hecha") : t("Pendiente")}</span>
        <Icon name="chevron" size={16} />
      </button>
    </li>
  );
}

function TierView({ tier }: { tier: Tier }) {
  const t = useT();
  const lessons = useProgress(state => state.lessons);
  const progress = useTierProgress(tier);
  const [open, setOpen] = useState<string | null>(null);
  const lessonList = tier.lessons ?? [];
  const lesson = lessonList.find(item => item.id === open);
  const sheet = tier.references?.find(item => item.id === open);
  if(lesson){
    const next = lessonList[lessonList.indexOf(lesson) + 1];
    return <LessonView key={lesson.id} lesson={lesson} next={next} back={() => setOpen(null)} onNext={() => setOpen(next?.id ?? null)} />;
  }
  if(sheet) return <ReferenceView sheet={sheet} back={() => setOpen(null)} />;
  const percent = progress.total ? Math.round(progress.done / progress.total * 100) : 0;
  return (
    <>
      <div className="tier-about">
        <section>
          <h3>{t("Sobre el nivel {n}", { n: tier.number })}</h3>
          <p className="muted">{t(tier.about)}</p>
        </section>
        <section>
          <h3>{t("Lo que aprenderás")}</h3>
          <ul className="tier-skills">{tier.skills.map(skill => <li key={skill}>{t(skill)}</li>)}</ul>
        </section>
      </div>
      <div className="tier-progress">
        <span>{t("Progreso")}</span>
        <span className="player-bar"><i style={{ width: `${percent}%` }} /></span>
        <span className="mono small">{percent}%</span>
      </div>
      {lessonList.length > 0 && (
        <ul className="tier-items">
          {lessonList.map(item => (
            <TierItem key={item.id} icon={item.icon} title={t(item.title)} meta={t("{n} min de lectura · una pregunta", { n: item.minutes })}
              done={Boolean(lessons[item.id])} onOpen={() => setOpen(item.id)} />
          ))}
        </ul>
      )}
      {tier.references && (
        <ul className="tier-items">
          {tier.references.map(item => (
            <TierItem key={item.id} icon={item.icon} title={t(item.title)} meta={t(item.summary)} done={Boolean(lessons[`ref:${item.id}`])}
              onOpen={() => { useProgress.getState().learn(`ref:${item.id}`); setOpen(item.id); }} />
          ))}
        </ul>
      )}
      {tier.machines && <MachineTable exercises={tier.machines.map(id => exerciseById(id)!).filter(Boolean)} />}
    </>
  );
}

export function StartingPoint() {
  const t = useT();
  const tierIndex = useView(state => state.tier);
  const tier = TIERS[tierIndex] ?? TIERS[0];
  return (
    <>
      <header className="start-hero">
        <div className="start-text">
          <span className="section-kicker">{t("Starting Point")}</span>
          <h1>{t("Aprende las bases de las redes")}</h1>
          <p className="muted">{t("Una base firme para todo lo demás, en cuatro niveles: de leer y responder a resolver tus primeras máquinas.")}</p>
          <ul className="start-chips">
            <li><Icon name="user" size={15} />{t("Para quien empieza")}</li>
            <li><Icon name="book" size={15} />{t("Lecciones cortas con pregunta")}</li>
            <li><Icon name="practice" size={15} />{t("Aprendizaje guiado")}</li>
          </ul>
        </div>
        <div className="start-art" aria-hidden="true">
          <Icon name="router" size={44} /><Icon name="switch" size={36} /><Icon name="pc" size={30} />
        </div>
      </header>
      <div className="tabs tier-tabs" role="tablist" aria-label={t("Niveles")}>
        {TIERS.map((item, i) => (
          <TierTab key={item.id} tier={item} active={i === tierIndex} onClick={() => useView.setState({ tier: i })} />
        ))}
      </div>
      <TierView key={tier.id} tier={tier} />
    </>
  );
}

function TierTab({ tier, active, onClick }: { tier: Tier; active: boolean; onClick: () => void }) {
  const t = useT();
  const progress = useTierProgress(tier);
  const complete = progress.total > 0 && progress.done === progress.total;
  return (
    <button type="button" role="tab" aria-selected={active} className={active ? "active" : ""} onClick={onClick}>
      {complete && <Icon name="check" size={14} />}{t("Nivel {n} · {title}", { n: tier.number, title: t(tier.title) })}
    </button>
  );
}
