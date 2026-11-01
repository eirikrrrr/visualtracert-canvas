// The Starting Point: four tiers for a beginner, from reading to playing.
// Each of the first three is a long guide (./guides): its sections with their
// diagrams, the documents to read further and a quiz on all of it; a section
// counts as read once its end has been on screen, and the tier is done when
// they all are and the quiz is passed. The last tier is the first machine of
// each topic. Each tier says what it is, the skills it gives and how far the
// user is.
import {
  exerciseById, QUIZ_PASS, solvedKey, TIERS,
  type Guide, type GuideReference, type GuideTier, type QuizQuestion, type Tier,
} from "@visual-tracert/model";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Icon } from "../editor/icons";
import { useT } from "../i18n";
import { GuideBlock, Rich } from "./blocks";
import { MachineTable, useView } from "./common";
import { useGuides } from "./guides";
import { ProtocolGrid } from "./Protocols";
import { useProgress } from "./progress";

/** what of a tier is done, of how much: its sections read and its quiz, or its machines */
export function useTierProgress(tier: Tier): { done: number; total: number } {
  const lessons = useProgress(state => state.lessons);
  const solved = useProgress(state => state.done);
  const guide = useGuides()?.[tier.guide as GuideTier];
  if(tier.guide){
    const sections = guide?.sections ?? [];
    const done = sections.filter(section => lessons[`${tier.guide}/${section.id}`]).length + (lessons[`quiz:${tier.guide}`] ? 1 : 0);
    return { done, total: guide ? sections.length + 1 : 0 };
  }
  const machines = tier.machines ?? [];
  return { done: machines.filter(id => solved[solvedKey(id, "easy")] || solved[solvedKey(id, "medium")]).length, total: machines.length };
}

/** marks each section read once its end has been on screen */
function useReadMarks(tier: GuideTier, root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const marks = root.current?.querySelectorAll<HTMLElement>("[data-read]");
    if(!marks?.length || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      for(const entry of entries) if(entry.isIntersecting){
        useProgress.getState().learn(`${tier}/${(entry.target as HTMLElement).dataset.read}`);
        observer.unobserve(entry.target);
      }
    });
    marks.forEach(mark => observer.observe(mark));
    return () => observer.disconnect();
  }, [tier, root]);
}

const anchor = (tier: GuideTier, id: string) => `guide-${tier}-${id}`;
const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

function References({ items }: { items: GuideReference[] }) {
  const t = useT();
  return (
    <ul className="guide-refs">
      {items.map(item => (
        <li key={item.url}>
          <a href={item.url} target="_blank" rel="noreferrer noopener"><Icon name="external" size={15} />{item.title}</a>
          <span className="muted small">{item.note}</span>
        </li>
      ))}
      <li className="muted small">{t("Los enlaces abren documentos externos, la mayoría en inglés.")}</li>
    </ul>
  );
}

function shuffled(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for(let i = n - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** the quiz at the end of a guide: one question at a time, then the result and what to review */
function Quiz({ tier, guide }: { tier: GuideTier; guide: Guide }) {
  const t = useT();
  const best = useProgress(state => state.scores[tier]);
  const passed = useProgress(state => Boolean(state.lessons[`quiz:${tier}`]));
  const [order, setOrder] = useState<number[] | null>(null);
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState<{ question: number; chosen: number }[]>([]);
  const [finished, setFinished] = useState(false);
  const total = guide.quiz.length;
  const titles = useMemo(() => Object.fromEntries(guide.sections.map((section, i) => [section.id, `${i + 1}. ${section.title}`])), [guide]);
  const start = () => { setOrder(shuffled(total)); setAt(0); setAnswers([]); setFinished(false); };

  if(!order){
    return (
      <div className="quiz-intro">
        <span className="section-icon" aria-hidden="true"><Icon name="flag" size={22} /></span>
        <div>
          <h3>{t("Quiz final del nivel")}</h3>
          <p className="muted">{t("{n} preguntas sobre todo lo que explica la guía, en orden aleatorio. Se aprueba con el {pass}% de aciertos.", { n: total, pass: Math.round(QUIZ_PASS * 100) })}</p>
          {best !== undefined && <p className="small">{passed ? t("Aprobado · tu mejor resultado: {n}%", { n: Math.round(best * 100) }) : t("Tu mejor resultado: {n}%", { n: Math.round(best * 100) })}</p>}
        </div>
        <button type="button" className="primary" onClick={start}>{best !== undefined ? t("Repetir el quiz") : t("Empezar el quiz")}</button>
      </div>
    );
  }

  const right = answers.filter(answer => guide.quiz[answer.question].answer === answer.chosen).length;
  if(finished){
    const share = right / total;
    const failed = answers.filter(answer => guide.quiz[answer.question].answer !== answer.chosen);
    return (
      <div className="quiz-result">
        <div className={`quiz-score${share >= QUIZ_PASS ? " pass" : ""}`}>
          <strong>{Math.round(share * 100)}%</strong>
          <span>{t("{right} de {total} aciertos", { right, total })}</span>
        </div>
        <p>{share >= QUIZ_PASS ? t("¡Aprobado! Has completado el quiz de este nivel.") : t("Aún no: hace falta el {pass}%. Repasa las secciones de tus fallos y vuelve a intentarlo.", { pass: Math.round(QUIZ_PASS * 100) })}</p>
        {failed.length > 0 && (
          <>
            <h4>{t("Para repasar")}</h4>
            <ul className="quiz-review">
              {failed.map(({ question }) => {
                const item = guide.quiz[question];
                return (
                  <li key={question}>
                    <strong>{item.q}</strong>
                    <span className="small">{t("Respuesta correcta")}: {item.options[item.answer]}</span>
                    <button type="button" className="ghost small" onClick={() => scrollTo(anchor(tier, item.section))}>{t("Repasar: {title}", { title: titles[item.section] ?? item.section })}</button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <button type="button" className="primary" onClick={start}>{t("Repetir el quiz")}</button>
      </div>
    );
  }

  const index = order[at];
  const item: QuizQuestion = guide.quiz[index];
  const chosen = answers[at]?.chosen ?? null;
  const answer = (i: number) => {
    if(chosen !== null) return;
    const next = [...answers, { question: index, chosen: i }];
    setAnswers(next);
    if(next.length === total){
      const share = next.filter(entry => guide.quiz[entry.question].answer === entry.chosen).length / total;
      useProgress.getState().score(tier, share, share >= QUIZ_PASS);
    }
  };
  return (
    <div className="quiz-run">
      <div className="quiz-top">
        <span className="small">{t("Pregunta {n} de {total}", { n: at + 1, total })}</span>
        <span className="player-bar"><i style={{ width: `${answers.length / total * 100}%` }} /></span>
        <span className="small mono">{t("{n} aciertos", { n: right })}</span>
      </div>
      <p className="quiz-question">{item.q}</p>
      <div className="lesson-options" role="radiogroup" aria-label={item.q}>
        {item.options.map((option, i) => (
          <button key={i} type="button" role="radio" aria-checked={chosen === i} disabled={chosen !== null}
            className={chosen === null ? "" : i === item.answer ? "right" : chosen === i ? "wrong" : ""} onClick={() => answer(i)}>
            <span className="lesson-letter">{String.fromCharCode(65 + i)}</span><Rich text={option} />
          </button>
        ))}
      </div>
      {chosen !== null && (
        <div className={chosen === item.answer ? "challenge-done" : "quiz-wrong"} role="status">
          <strong>{chosen === item.answer ? t("¡Correcto!") : t("No es esa.")}</strong>
          <span className="small"><Rich text={item.why} /></span>
          <div className="challenge-actions">
            <button type="button" className="primary small" onClick={() => (at + 1 === total ? setFinished(true) : setAt(at + 1))}>{at + 1 === total ? t("Ver el resultado") : t("Siguiente pregunta")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function GuideView({ tier, guide }: { tier: GuideTier; guide: Guide }) {
  const t = useT();
  const lessons = useProgress(state => state.lessons);
  const article = useRef<HTMLElement>(null);
  useReadMarks(tier, article);
  return (
    <div className="guide">
      <nav className="guide-toc" aria-label={t("Índice")}>
        <span className="section-kicker">{t("Índice")}</span>
        <ol>
          {guide.sections.map((section, i) => {
            const read = Boolean(lessons[`${tier}/${section.id}`]);
            return (
              <li key={section.id}>
                <button type="button" className={read ? "read" : ""} onClick={() => scrollTo(anchor(tier, section.id))}>
                  <span className="guide-toc-n">{read ? <Icon name="check" size={13} /> : i + 1}</span>{section.title}
                </button>
              </li>
            );
          })}
          <li><button type="button" onClick={() => scrollTo(anchor(tier, "references"))}><span className="guide-toc-n"><Icon name="book" size={13} /></span>{t("Documentos de referencia")}</button></li>
          <li><button type="button" className={lessons[`quiz:${tier}`] ? "read" : ""} onClick={() => scrollTo(anchor(tier, "quiz"))}><span className="guide-toc-n"><Icon name={lessons[`quiz:${tier}`] ? "check" : "flag"} size={13} /></span>{t("Quiz final")}</button></li>
        </ol>
      </nav>
      <article className="guide-body" ref={article}>
        <header className="guide-head">
          <h2>{guide.title}</h2>
          <p className="muted">{guide.intro}</p>
          <span className="small muted">{t("{n} min de lectura · {sections} secciones · {questions} preguntas", { n: guide.minutes, sections: guide.sections.length, questions: guide.quiz.length })}</span>
        </header>
        {guide.sections.map((section, i) => (
          <section key={section.id} id={anchor(tier, section.id)} className="guide-section">
            <h3><span className="guide-n">{i + 1}</span>{section.title}</h3>
            {section.blocks.map((block, b) => <GuideBlock key={b} block={block} />)}
            <span data-read={section.id} aria-hidden="true" />
          </section>
        ))}
        <section id={anchor(tier, "references")} className="guide-section">
          <h3><span className="guide-n"><Icon name="book" size={15} /></span>{t("Documentos de referencia")}</h3>
          <References items={guide.references} />
        </section>
        <section id={anchor(tier, "quiz")} className="guide-section guide-quiz">
          <Quiz tier={tier} guide={guide} />
        </section>
      </article>
    </div>
  );
}

function TierView({ tier }: { tier: Tier }) {
  const t = useT();
  const guides = useGuides();
  const progress = useTierProgress(tier);
  const percent = progress.total ? Math.round(progress.done / progress.total * 100) : 0;
  let body: ReactNode = null;
  if(tier.guide) body = guides ? <>
    {tier.guide === "references" && <ProtocolGrid />}
    <GuideView key={tier.guide} tier={tier.guide} guide={guides[tier.guide]} />
  </> : <p className="muted small">{t("Cargando la guía…")}</p>;
  else if(tier.machines) body = <MachineTable exercises={tier.machines.map(id => exerciseById(id)!).filter(Boolean)} />;
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
      {body}
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
          <p className="muted">{t("Una base firme para todo lo demás, en cuatro niveles: tres guías completas, con diagramas y un quiz al final de cada una, y tus primeras máquinas.")}</p>
          <ul className="start-chips">
            <li><Icon name="user" size={15} />{t("Para quien empieza")}</li>
            <li><Icon name="book" size={15} />{t("Guías con diagramas")}</li>
            <li><Icon name="flag" size={15} />{t("Un quiz por nivel")}</li>
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
