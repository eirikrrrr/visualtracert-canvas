// The dashboard's machines, for an admin: every machine, the app's and their
// own, with what was changed of it. One of the app's can be edited (its name,
// story, level, points, picture, walkthrough as a PDF, protocols, hidden) and
// put back as it came. A machine of their own is made from labs: the one open
// as it starts (broken), and the one open again once fixed as its solution,
// with its goals, which the solution must pass. The form is a draft kept while
// the app runs, so the dashboard can be closed to fix the lab and opened again.
import {
  baseMachine, BOXES, DIFFICULTY_LABEL, EXERCISES, isBaseMachine, LEVEL_LABEL, PROTOCOLS, XP,
  type Check, type Exercise, type ExerciseLevel, type Goal, type ProtocolId, type Topology,
} from "@visual-tracert/model";
import { useState } from "react";
import { create } from "zustand";
import { useStore } from "../app/store";
import { Icon } from "../editor/icons";
import { tx, useT } from "../i18n";
import { MachineAvatar } from "../practice/MachineAvatar";
import { checkGoals as checkLab } from "../practice/check";
import { fileUrl, practiceApi, useShared } from "../practice/server";

interface Draft {
  /** its id; new: not saved yet */
  id: string;
  isNew: boolean;
  custom: boolean;
  codename: string;
  title: string;
  story: string;
  summary: string;
  level: ExerciseLevel;
  xp: string;
  image?: string;
  pdf?: string;
  hidden: boolean;
  protocols: ProtocolId[];
  box: string;
  icon: string;
  goals: Goal[];
  hints: string;
  cli: string;
  start?: Topology;
  solution?: Topology;
}

/** the draft being edited: kept when the dashboard closes */
const useDraft = create<{ draft: Draft | null }>(() => ({ draft: null }));
const edit = (change: Partial<Draft>) => useDraft.setState(state => ({ draft: state.draft ? { ...state.draft, ...change } : null }));

const ICONS = ["pc", "laptop", "server", "router", "switch", "firewall", "cloud", "globe", "phone", "ap", "search"];

function draftOf(exercise: Exercise): Draft {
  const custom = Boolean(exercise.custom);
  return {
    id: exercise.id, isNew: false, custom, codename: exercise.codename, title: exercise.title, story: exercise.story, summary: exercise.summary,
    level: exercise.level, xp: exercise.xp !== undefined ? String(exercise.xp) : "", image: exercise.image, pdf: exercise.pdf, hidden: Boolean(exercise.hidden),
    protocols: [...exercise.protocols], box: exercise.box, icon: exercise.icon, goals: exercise.goals.map(goal => ({ ...goal, check: { ...goal.check } })),
    hints: exercise.hints.join("\n"), cli: (exercise.cli ?? []).join("\n"),
    ...(custom ? { start: exercise.build(), solution: exercise.solve(exercise.build()) } : {}),
  };
}

const blank = (): Draft => ({
  id: "", isNew: true, custom: true, codename: "", title: "", story: "", summary: "", level: 1, xp: "", hidden: false,
  protocols: [], box: "routing", icon: "router", goals: [], hints: "", cli: "",
});

const lines = (text: string) => text.split("\n").map(line => line.trim()).filter(Boolean);

/** what is sent: for one of the app's, only what differs from it (its texts
 * stay translated where they were not changed) */
function payload(draft: Draft): Record<string, unknown> {
  const common: Record<string, unknown> = {
    codename: draft.codename, title: draft.title, story: draft.story, summary: draft.summary, level: draft.level,
    xp: draft.xp.trim() === "" ? undefined : Number(draft.xp), image: draft.image, pdf: draft.pdf, hidden: draft.hidden, protocols: draft.protocols,
  };
  const base = baseMachine(draft.id);
  if(!draft.custom && base){
    const same = (key: string, value: unknown) => JSON.stringify((base as unknown as Record<string, unknown>)[key] ?? (key === "hidden" ? false : undefined)) === JSON.stringify(value);
    return Object.fromEntries(Object.entries(common).filter(([key, value]) => value !== undefined && !same(key, value)));
  }
  return { ...common, box: draft.box, icon: draft.icon, goals: draft.goals, hints: lines(draft.hints), cli: lines(draft.cli), start: draft.start, solution: draft.solution };
}

function FileField({ label, accept, value, kind, onChange }: { label: string; accept: string; value?: string; kind: "image" | "pdf"; onChange: (id?: string) => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <div className="field machine-file">
      <span>{label}</span>
      <div className="machine-file-row">
        {value && (kind === "image"
          ? <img src={fileUrl(value)} alt="" className="machine-file-preview" />
          : <a href={fileUrl(value)} target="_blank" rel="noreferrer noopener" className="small"><Icon name="file" size={14} />{t("Ver el PDF")}</a>)}
        <label className="ghost small button-like">
          <Icon name="upload" size={14} />{busy ? t("Subiendo…") : value ? t("Cambiar") : t("Subir")}
          <input type="file" accept={accept} hidden disabled={busy} onChange={async event => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if(!file) return;
            setBusy(true);
            try{ onChange(await practiceApi.upload(file)); }
            catch(error){ useStore.getState().notify((error as Error).message, "error"); }
            finally{ setBusy(false); }
          }} />
        </label>
        {value && <button type="button" className="ghost small" onClick={() => onChange(undefined)}>{t("Quitar")}</button>}
      </div>
    </div>
  );
}

const KINDS: { kind: Check["kind"]; label: string }[] = [
  { kind: "ping", label: tx("Hace ping a") }, { kind: "isolated", label: tx("No llega a") }, { kind: "dhcp", label: tx("Recibe dirección por DHCP") },
  { kind: "dns", label: tx("Resuelve un nombre") }, { kind: "http", label: tx("Abre una web") }, { kind: "vlan", label: tx("Puerto en una VLAN") },
];

function newCheck(kind: Check["kind"], device: string): Check {
  if(kind === "dhcp") return { kind, from: device };
  if(kind === "dns") return { kind, from: device, name: "", ip: "" };
  if(kind === "vlan") return { kind, device, iface: "", vlan: 10 };
  return { kind, from: device, to: "" };
}

function GoalsEditor({ draft }: { draft: Draft }) {
  const t = useT();
  const devices = draft.start?.devices ?? [];
  const set = (i: number, goal: Goal) => edit({ goals: draft.goals.map((item, j) => j === i ? goal : item) });
  if(!devices.length) return <p className="muted small">{t("Elige antes el laboratorio de partida: los objetivos se escriben con sus equipos.")}</p>;
  return (
    <>
      <ul className="machine-goals">
        {draft.goals.map((goal, i) => {
          const check = goal.check as Check & Record<string, unknown>;
          const device = (check.kind === "vlan" ? check.device : check.from) as string;
          const select = (value: string, change: (value: string) => void, label: string) => (
            <select aria-label={label} value={value} onChange={event => change(event.target.value)}>
              {devices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          );
          return (
            <li key={i}>
              <input className="machine-goal-text" placeholder={t("Lo que verá el jugador: «PC A hace ping a PC B»")} value={goal.text} onChange={event => set(i, { ...goal, text: event.target.value })} />
              <div className="machine-goal-check">
                {select(device, value => set(i, { ...goal, check: check.kind === "vlan" ? { ...check, device: value } as Check : { ...check, from: value } as Check }), t("Equipo"))}
                <select aria-label={t("Comprobación")} value={check.kind} onChange={event => set(i, { ...goal, check: newCheck(event.target.value as Check["kind"], device) })}>
                  {KINDS.map(item => <option key={item.kind} value={item.kind}>{t(item.label)}</option>)}
                </select>
                {(check.kind === "ping" || check.kind === "isolated" || check.kind === "http") && (
                  <input aria-label={t("Destino")} list="machine-devices" placeholder={t("equipo, IP o nombre")} value={check.to as string} onChange={event => set(i, { ...goal, check: { ...check, to: event.target.value } as Check })} />
                )}
                {check.kind === "dns" && <>
                  <input aria-label={t("Nombre")} placeholder="www.ejemplo.com" value={check.name as string} onChange={event => set(i, { ...goal, check: { ...check, name: event.target.value } as Check })} />
                  <input aria-label="IP" placeholder="172.20.0.80" value={check.ip as string} onChange={event => set(i, { ...goal, check: { ...check, ip: event.target.value } as Check })} />
                </>}
                {check.kind === "vlan" && <>
                  <input aria-label={t("Puerto")} placeholder="Fa0/3" value={check.iface as string} onChange={event => set(i, { ...goal, check: { ...check, iface: event.target.value } as Check })} />
                  <input aria-label="VLAN" type="number" min={1} max={4094} value={check.vlan as number} onChange={event => set(i, { ...goal, check: { ...check, vlan: Number(event.target.value) } as Check })} />
                </>}
                <button type="button" className="icon-button" aria-label={t("Quitar el objetivo")} onClick={() => edit({ goals: draft.goals.filter((_, j) => j !== i) })}><Icon name="trash" size={15} /></button>
              </div>
            </li>
          );
        })}
      </ul>
      <datalist id="machine-devices">{devices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</datalist>
      {draft.goals.length < 8 && (
        <button type="button" className="ghost small" onClick={() => edit({ goals: [...draft.goals, { text: "", check: newCheck("ping", devices[0].id) }] })}>
          <Icon name="plus" size={14} />{t("Añadir un objetivo")}
        </button>
      )}
    </>
  );
}

/** the labs of a machine of their own: as it starts, and solved, from the lab open */
function LabsEditor({ draft }: { draft: Draft }) {
  const t = useT();
  const take = () => structuredClone(useStore.getState().topology);
  const solution = draft.solution && draft.goals.length ? checkLab(draft.solution, draft.goals, t) : [];
  const start = draft.start && draft.goals.length ? checkLab(draft.start, draft.goals, t) : [];
  const describe = (lab?: Topology) => lab ? t("«{name}»: {devices} equipos, {links} cables", { name: lab.name, devices: lab.devices.length, links: lab.links.length }) : t("Sin elegir");
  return (
    <div className="machine-labs">
      <div>
        <strong>{t("1. Cómo empieza (con la avería)")}</strong>
        <span className="muted small">{describe(draft.start)}</span>
        <button type="button" className="ghost small" onClick={() => edit({ start: take() })}><Icon name="download" size={14} />{t("Usar el laboratorio abierto")}</button>
      </div>
      <div>
        <strong>{t("2. Cómo queda resuelta")}</strong>
        <span className="muted small">{describe(draft.solution)}</span>
        <button type="button" className="ghost small" onClick={() => edit({ solution: take() })}><Icon name="download" size={14} />{t("Usar el laboratorio abierto")}</button>
      </div>
      <p className="muted small">{t("Monta el laboratorio con la avería en Simulación y guárdalo aquí como punto de partida. Después arréglalo, vuelve y guárdalo como solución: puedes cerrar el panel entre medias, el borrador se conserva.")}</p>
      {solution.length > 0 && (
        solution.every(result => result.ok)
          ? <p className="small ok-text"><Icon name="check" size={14} />{t("La solución cumple todos los objetivos en la simulación.")}</p>
          : <p className="small error-text">{t("La solución aún no cumple: {goals}", { goals: draft.goals.filter((_, i) => !solution[i].ok).map(goal => goal.text || "?").join(" · ") })}</p>
      )}
      {start.length > 0 && start.every(result => result.ok) && <p className="small error-text">{t("El laboratorio de partida ya cumple todos los objetivos: no habría nada que resolver.")}</p>}
    </div>
  );
}

function MachineEditor({ draft }: { draft: Draft }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const base = !draft.custom;
  const changed = useShared(state => state.machines.some(record => record.id === draft.id));
  const save = async () => {
    if(draft.custom && draft.solution && draft.goals.length && !checkLab(draft.solution, draft.goals, t).every(result => result.ok)){
      useStore.getState().notify(t("La solución no cumple todos los objetivos: revísala antes de guardar."), "error");
      return;
    }
    setBusy(true);
    try{
      await practiceApi.putMachine(draft.id, payload(draft));
      await useShared.getState().refreshMachines();
      useStore.getState().notify(t("Máquina guardada."), "ok");
      useDraft.setState({ draft: null });
    }catch(error){ useStore.getState().notify((error as Error).message, "error"); }
    finally{ setBusy(false); }
  };
  const remove = async () => {
    if(!window.confirm(base ? t("¿Volver a la máquina tal como viene en la app?") : t("¿Borrar esta máquina? Sus resueltas dejarán de contar."))) return;
    try{ await practiceApi.deleteMachine(draft.id); await useShared.getState().refreshMachines(); useDraft.setState({ draft: null }); }
    catch(error){ useStore.getState().notify((error as Error).message, "error"); }
  };
  const defaultXp = XP[draft.level];
  return (
    <form className="machine-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
      <button type="button" className="back-button" onClick={() => useDraft.setState({ draft: null })}><Icon name="prev" size={16} />{t("Todas las máquinas")}</button>
      <h3>{draft.isNew ? t("Nueva máquina") : t(draft.codename) || draft.id}{base && <span className="tag">{t("De la app")}</span>}</h3>
      <div className="machine-editor-grid">
        {draft.isNew && (
          <label className="field"><span>{t("Identificador")}</span>
            <input required pattern="[a-z0-9][a-z0-9-]{2,39}" placeholder="isla-perdida" value={draft.id} onChange={event => edit({ id: event.target.value.toLowerCase() })} />
          </label>
        )}
        <label className="field"><span>{t("Nombre de la máquina")}</span><input required maxLength={60} value={draft.codename} onChange={event => edit({ codename: event.target.value })} /></label>
        <label className="field"><span>{t("Título")}</span><input required maxLength={120} value={draft.title} onChange={event => edit({ title: event.target.value })} /></label>
        <label className="field"><span>{t("Nivel")}</span>
          <select value={draft.level} onChange={event => edit({ level: Number(event.target.value) as ExerciseLevel })}>
            {([1, 2, 3] as const).map(level => <option key={level} value={level}>{t(LEVEL_LABEL[level])}</option>)}
          </select>
        </label>
        <label className="field"><span>{t("XP en {difficulty}", { difficulty: t(DIFFICULTY_LABEL.easy) })}</span>
          <input type="number" min={0} max={1000} placeholder={t("{n} (la de su nivel)", { n: defaultXp })} value={draft.xp} onChange={event => edit({ xp: event.target.value })} />
          <span className="field-hint">{t("En Medio da el doble.")}</span>
        </label>
        {draft.custom && <>
          <label className="field"><span>{t("Tema")}</span>
            <select value={draft.box} onChange={event => edit({ box: event.target.value })}>{BOXES.map(box => <option key={box.id} value={box.id}>{t(box.title)}</option>)}</select>
          </label>
          <label className="field"><span>{t("Icono")}</span>
            <select value={draft.icon} onChange={event => edit({ icon: event.target.value })}>{ICONS.map(icon => <option key={icon} value={icon}>{icon}</option>)}</select>
          </label>
        </>}
      </div>
      <label className="field"><span>{t("Historia")}</span><textarea required={draft.custom} rows={2} maxLength={600} value={draft.story} onChange={event => edit({ story: event.target.value })} /></label>
      <label className="field"><span>{t("Qué hay que hacer")}</span><textarea required={draft.custom} rows={2} maxLength={600} value={draft.summary} onChange={event => edit({ summary: event.target.value })} /></label>
      <div className="field"><span>{t("Protocolos")}</span>
        <div className="machine-protocols">
          {PROTOCOLS.map(protocol => (
            <label key={protocol.id} className={draft.protocols.includes(protocol.id) ? "on" : ""}>
              <input type="checkbox" checked={draft.protocols.includes(protocol.id)}
                onChange={event => edit({ protocols: event.target.checked ? [...draft.protocols, protocol.id] : draft.protocols.filter(id => id !== protocol.id) })} />
              {protocol.id.toUpperCase()}
            </label>
          ))}
        </div>
      </div>
      <div className="machine-editor-grid">
        <FileField label={t("Imagen (PNG, JPEG o WebP, hasta 2 MB)")} accept="image/png,image/jpeg,image/webp" kind="image" value={draft.image} onChange={image => edit({ image })} />
        <FileField label={t("Walkthrough en PDF (hasta 10 MB)")} accept="application/pdf" kind="pdf" value={draft.pdf} onChange={pdf => edit({ pdf })} />
      </div>
      {draft.custom && <>
        <h4>{t("Laboratorios")}</h4>
        <LabsEditor draft={draft} />
        <h4>{t("Objetivos")}</h4>
        <GoalsEditor draft={draft} />
        <label className="field"><span>{t("Pistas (una por línea)")}</span><textarea rows={3} value={draft.hints} onChange={event => edit({ hints: event.target.value })} /></label>
        <label className="field"><span>{t("Pasos de CLI (una por línea): con ellos, se juega también en Medio")}</span><textarea rows={3} className="mono" value={draft.cli} onChange={event => edit({ cli: event.target.value })} /></label>
      </>}
      <label className="machine-hidden"><input type="checkbox" checked={draft.hidden} onChange={event => edit({ hidden: event.target.checked })} />{t("Ocultarla de las listas (sus resueltas siguen contando)")}</label>
      <div className="machine-editor-actions">
        <button type="submit" className="primary" disabled={busy || (draft.custom && (!draft.start || !draft.solution || !draft.goals.length))}><Icon name="check" size={15} />{t("Guardar")}</button>
        {!draft.isNew && (changed || draft.custom) && (
          <button type="button" className="danger" onClick={() => void remove()}>{base ? t("Volver a la original") : t("Borrar la máquina")}</button>
        )}
      </div>
    </form>
  );
}

export function MachinesSection() {
  const t = useT();
  const draft = useDraft(state => state.draft);
  const records = useShared(state => state.machines);
  useShared(state => state.machinesVersion);
  if(draft) return <MachineEditor draft={draft} />;
  return (
    <>
      <p className="muted small">{t("Edita las máquinas de la app (nombre, historia, nivel, XP, imagen, walkthrough en PDF) o crea las tuyas a partir de un laboratorio.")}</p>
      <button type="button" className="primary small" onClick={() => useDraft.setState({ draft: blank() })}><Icon name="plus" size={15} />{t("Nueva máquina")}</button>
      <ul className="dash-images machine-admin-list">
        {EXERCISES.map(exercise => {
          const changed = records.some(record => record.id === exercise.id);
          return (
            <li key={exercise.id}>
              <MachineAvatar exercise={exercise} size={38} />
              <div className="dash-lab-text"><strong>{t(exercise.codename)}</strong><span className="mono muted small">{exercise.id} · {t(LEVEL_LABEL[exercise.level])}</span></div>
              {exercise.custom ? <span className="tag tag-images">{t("Tuya")}</span> : changed && isBaseMachine(exercise.id) && <span className="tag">{t("Editada")}</span>}
              {exercise.hidden && <span className="tag">{t("Oculta")}</span>}
              <button type="button" className="ghost small" onClick={() => useDraft.setState({ draft: draftOf(exercise) })}><Icon name="settings" size={14} />{t("Editar")}</button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
