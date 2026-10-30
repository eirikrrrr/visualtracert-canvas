// App state: the topology (with undo/redo), what is selected, the tool, the
// mode and the simulation being played back. The topology is the single
// source of truth: the canvas, the properties panel and the document are
// views of it, and every change goes through commit().
import { create } from "zustand";
import { t, tx, type T } from "../i18n";
import { emptyTopology, exampleTopology, removeDevices, removeLinks, templateById, type Topology } from "@visual-tracert/model";
import { applyLease, PROTOCOLS, simulate, type Protocol, type SimEvent, type SimKind, type SimOutcome, type SimRequest, type SimRun } from "../sim/engine";
import { deleteLab, listLabs, loadLab, newLabId, saveLab, setCurrentLabId, startingLab, type LabMeta } from "./labs";

const THEME_KEY = "visual-tracert.theme";
const HISTORY_LIMIT = 100;
const SIDE_KEY = "visual-tracert.side-width";
const SIDE_FLOAT_KEY = "visual-tracert.side-float";
export interface SideFloat { x: number; y: number; width: number; height: number }
const SIDE_FLOAT_DEFAULT: SideFloat = { x: -1, y: 16, width: 420, height: 640 };
export const SIDE_DEFAULT = 380;
export const SIDE_MIN = 320;

export type Selection = { kind: "device" | "link"; id: string } | null;
export type Tool = "select" | "ping";
/** simulation: the network is modelled here; emulation (to come): real devices */
export type Mode = "simulation" | "emulation";
/** how a run is played back: at once ("realtime") or frame by frame at a speed */
export type Speed = "realtime" | 0.5 | 1 | 2 | 4;
export const SPEEDS: Speed[] = ["realtime", 0.5, 1, 2, 4];
const SPEED_KEY = "visual-tracert.speed";

function loadSpeed(): Speed {
  try{
    const saved = localStorage.getItem(SPEED_KEY);
    const speed = saved === "realtime" ? saved : Number(saved);
    if(SPEEDS.includes(speed as Speed)) return speed as Speed;
  }catch(_){ /* no storage */ }
  return 1;
}
export type Tab = "properties" | "document" | "simulation";
export type Theme = "azul" | "marron" | "editorial" | "morado";

export const THEMES: { id: Theme; label: string; light: boolean; swatch: [string, string, string] }[] = [
  { id: "azul", label: tx("Azul"), light: false, swatch: ["#0d0d0e", "#1b1b1d", "#3d7eff"] },
  { id: "marron", label: tx("Marrón"), light: false, swatch: ["#100c09", "#211a15", "#c8834b"] },
  { id: "editorial", label: tx("Editorial"), light: true, swatch: ["#f5f3ee", "#ffffff", "#b3261e"] },
  { id: "morado", label: tx("Morado"), light: false, swatch: ["#0c0a10", "#1c1823", "#9b6dff"] },
];

export const isLightTheme = (theme: Theme) => THEMES.find(item => item.id === theme)?.light ?? false;

/** An action (ping, trace…) recorded in the log, with every frame it produced. */
export interface LogRun {
  id: number;
  at: number;
  kind: SimKind;
  from: string;
  fromName: string;
  to: string;
  outcome: SimOutcome;
  events: (SimEvent & { fromName: string; toName: string })[];
}

export interface SimDraft {
  kind: SimKind;
  from: string;
  /** what was last written as the destination of each kind of action */
  targets: Partial<Record<SimKind, string>>;
  ttl: number;
  maxHops: number;
}

const KIND_LABEL: Record<SimKind, string> = { ping: tx("Ping"), traceroute: tx("Traza"), dhcp: tx("DHCP"), dns: tx("DNS"), http: tx("Web") };

/** "Ping PC 1 → 8.8.8.8", in the language it is shown in */
export function labelOf(run: Pick<LogRun, "kind" | "fromName" | "to">, t: T): string {
  if(run.kind === "dhcp") return t("DHCP en {device}", { device: run.fromName });
  return `${t(KIND_LABEL[run.kind])} ${run.fromName} → ${run.to}`;
}

export type LogDock = "docked" | "floating" | "hidden";
export interface LogLayout {
  dock: LogDock;
  /** how it was shown before it was hidden */
  last: "docked" | "floating";
  height: number;
  float: { x: number; y: number; width: number; height: number };
}

const LOG_KEY = "visual-tracert.log-layout";
const LOG_MAX_EVENTS = 3000;
const LOG_DEFAULT: LogLayout = { dock: "hidden", last: "docked", height: 240, float: { x: 80, y: 80, width: 760, height: 320 } };

function loadLogLayout(): LogLayout {
  try{
    const saved = JSON.parse(localStorage.getItem(LOG_KEY) ?? "null");
    if(saved && ["docked", "floating", "hidden"].includes(saved.dock)) return { ...LOG_DEFAULT, ...saved, float: { ...LOG_DEFAULT.float, ...saved.float } };
  }catch(_){ /* none */ }
  return LOG_DEFAULT;
}

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "ok" | "error";
}

interface State {
  /** the lab being edited, and every lab saved in this browser */
  labId: string;
  labs: LabMeta[];
  topology: Topology;
  past: Topology[];
  future: Topology[];
  /** topology before a gesture (a drag), to make the whole gesture one undo step */
  gestureStart: Topology | null;
  selection: Selection;
  tool: Tool;
  /** first device chosen with the ping tool */
  pingFrom: string | null;
  mode: Mode;
  speed: Speed;
  tab: Tab;
  theme: Theme;
  run: SimRun | null;
  /** the action being prepared in the simulation panel, with a target per kind */
  draft: SimDraft;
  /** the action of the run on the canvas */
  request: SimRequest | null;
  /** index of the event shown on the canvas, -1 before the first */
  step: number;
  playing: boolean;
  filters: Record<Protocol, boolean>;
  toast: Toast | null;
  /** the "add a device" list is open */
  adding: boolean;
  /** the gallery of ready-made labs is open */
  gallery: boolean;
  /** width of the side panel, and whether it covers the canvas */
  sideWidth: number;
  sideFull: boolean;
  /** undocked: a window over the canvas; x -1 is "near the right edge" */
  sideFloating: boolean;
  sideFloat: SideFloat;
  /** pings of this session, oldest first, and where the log is shown */
  log: LogRun[];
  logLayout: LogLayout;

  commit: (next: Topology) => void;
  beginGesture: () => void;
  setLive: (next: Topology) => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
  replace: (next: Topology) => void;
  switchLab: (id: string) => void;
  createLab: (from: "empty" | "example" | "duplicate") => void;
  /** a new lab with a copy of a template */
  openTemplate: (id: string) => void;
  setGallery: (open: boolean) => void;
  removeLab: (id: string) => void;
  /** saves a topology as a new lab and opens it */
  startLab: (topology: Topology) => void;
  select: (selection: Selection) => void;
  setTool: (tool: Tool) => void;
  setPingFrom: (id: string | null) => void;
  setMode: (mode: Mode) => void;
  setSpeed: (speed: Speed) => void;
  setTab: (tab: Tab) => void;
  setTheme: (theme: Theme) => void;
  runSim: (request: SimRequest) => void;
  runPing: (from: string, to: string, ttl?: number) => void;
  setDraft: (draft: Partial<State["draft"]>) => void;
  clearRun: () => void;
  setStep: (step: number) => void;
  setPlaying: (playing: boolean) => void;
  toggleFilter: (protocol: Protocol) => void;
  notify: (text: string, kind?: Toast["kind"]) => void;
  setAdding: (adding: boolean) => void;
  setSideWidth: (width: number, save?: boolean) => void;
  setSideFull: (full: boolean) => void;
  setSideFloating: (floating: boolean) => void;
  setSideFloat: (float: Partial<SideFloat>) => void;
  clearLog: () => void;
  setLogLayout: (change: Partial<LogLayout>) => void;
  toggleLog: () => void;
}

// the last lab used, or the example as a first lab
function openingLab(): { id: string; topology: Topology; labs: LabMeta[] } {
  const start = startingLab();
  if(start) return { ...start, labs: listLabs() };
  const id = newLabId();
  const topology = exampleTopology(t);
  const labs = saveLab(id, topology);
  setCurrentLabId(id);
  return { id, topology, labs };
}
const opening = openingLab();

// what a fresh lab starts with: no history, nothing selected, no simulation
const freshLab = { past: [], future: [], selection: null, run: null, request: null, step: -1, playing: false, pingFrom: null };

function loadTheme(): Theme {
  try{
    const saved = localStorage.getItem(THEME_KEY);
    if(THEMES.some(item => item.id === saved)) return saved as Theme;
    // the two themes of the first version
    if(saved === "light") return "editorial";
  }catch(_){ /* no storage */ }
  return "azul";
}

function loadSideFloat(): { floating: boolean; float: SideFloat } {
  try{
    const saved = JSON.parse(localStorage.getItem(SIDE_FLOAT_KEY) ?? "null");
    if(saved && saved.float) return { floating: Boolean(saved.floating), float: { ...SIDE_FLOAT_DEFAULT, ...saved.float } };
  }catch(_){ /* none */ }
  return { floating: false, float: SIDE_FLOAT_DEFAULT };
}
const sideFloatSaved = loadSideFloat();
const saveSideFloat = (floating: boolean, float: SideFloat) => {
  try{ localStorage.setItem(SIDE_FLOAT_KEY, JSON.stringify({ floating, float })); }catch(_){ /* ignore */ }
};

function loadSideWidth(): number {
  try{
    const saved = Number(localStorage.getItem(SIDE_KEY));
    if(saved >= SIDE_MIN) return saved;
  }catch(_){ /* none */ }
  return SIDE_DEFAULT;
}

let toastId = 0;

export const useStore = create<State>((set, get) => ({
  labId: opening.id,
  labs: opening.labs,
  topology: opening.topology,
  past: [],
  future: [],
  gestureStart: null,
  selection: null,
  tool: "select",
  pingFrom: null,
  mode: "simulation",
  speed: loadSpeed(),
  tab: "properties",
  theme: loadTheme(),
  run: null,
  draft: { kind: "ping", from: "", targets: {}, ttl: 64, maxHops: 30 },
  request: null,
  step: -1,
  playing: false,
  filters: Object.fromEntries(PROTOCOLS.map(protocol => [protocol, true])) as Record<Protocol, boolean>,
  toast: null,
  adding: false,
  gallery: false,
  sideWidth: loadSideWidth(),
  sideFull: false,
  sideFloating: sideFloatSaved.floating,
  sideFloat: sideFloatSaved.float,
  log: [],
  logLayout: loadLogLayout(),

  // a change of the topology invalidates a simulation computed on the old one
  commit: next => set(state => next === state.topology ? {} : {
    topology: next,
    past: [...state.past, state.topology].slice(-HISTORY_LIMIT),
    future: [],
    run: null, step: -1, playing: false,
  }),
  beginGesture: () => set(state => ({ gestureStart: state.topology })),
  setLive: next => set({ topology: next }),
  endGesture: () => set(state => {
    const start = state.gestureStart;
    if(!start || start === state.topology) return { gestureStart: null };
    return { gestureStart: null, past: [...state.past, start].slice(-HISTORY_LIMIT), future: [], run: null, step: -1, playing: false };
  }),
  undo: () => set(state => {
    const previous = state.past[state.past.length - 1];
    if(!previous) return {};
    return { topology: previous, past: state.past.slice(0, -1), future: [state.topology, ...state.future], run: null, step: -1, playing: false, selection: null };
  }),
  redo: () => set(state => {
    const next = state.future[0];
    if(!next) return {};
    return { topology: next, past: [...state.past, state.topology], future: state.future.slice(1), run: null, step: -1, playing: false, selection: null };
  }),
  // a new or loaded lab: no history of the previous one
  replace: next => set({ topology: next, ...freshLab }),
  switchLab: id => {
    if(id === get().labId) return;
    flushSave();
    const topology = loadLab(id);
    if(!topology){ get().notify(t("No se pudo abrir ese laboratorio."), "error"); return; }
    setCurrentLabId(id);
    set({ labId: id, topology, ...freshLab });
  },
  createLab: from => {
    const current = get().topology;
    get().startLab(from === "example" ? exampleTopology(t)
      : from === "duplicate" ? { ...current, name: t("{name} (copia)", { name: current.name }) }
      : emptyTopology(t("Laboratorio sin título")));
  },
  openTemplate: id => {
    const template = templateById(id);
    if(!template) return;
    get().startLab(template.build(t));
    set({ gallery: false, selection: null, tab: "properties" });
    get().notify(t("Abierto «{name}» como laboratorio nuevo.", { name: t(template.name) }), "ok");
  },
  setGallery: gallery => set({ gallery }),
  startLab: topology => {
    flushSave();
    const id = newLabId();
    const labs = saveLab(id, topology);
    setCurrentLabId(id);
    set({ labId: id, labs, topology, ...freshLab });
  },
  removeLab: id => {
    const labs = deleteLab(id);
    if(id !== get().labId){ set({ labs }); return; }
    // the open lab was removed: open the next one, or a new empty one
    const next = labs[0];
    const topology = next ? loadLab(next.id) : null;
    if(next && topology){
      setCurrentLabId(next.id);
      set({ labId: next.id, labs, topology, ...freshLab });
    }else{
      const fresh = newLabId();
      const empty = emptyTopology(t("Laboratorio sin título"));
      setCurrentLabId(fresh);
      set({ labId: fresh, labs: saveLab(fresh, empty), topology: empty, ...freshLab });
    }
  },
  select: selection => set({ selection }),
  setTool: tool => set({ tool, pingFrom: null }),
  setPingFrom: pingFrom => set({ pingFrom }),
  setMode: mode => set({ mode, playing: false }),
  setSpeed: speed => {
    try{ localStorage.setItem(SPEED_KEY, String(speed)); }catch(_){ /* ignore */ }
    set({ speed });
  },
  setTab: tab => set({ tab }),
  setTheme: theme => {
    try{ localStorage.setItem(THEME_KEY, theme); }catch(_){ /* ignore */ }
    set({ theme });
  },
  runSim: request => {
    const state = get();
    const topology = state.topology;
    const run = simulate(topology, request, t);
    // in real time the run shows its end at once; at a speed it plays from the start
    const simulation = state.speed !== "realtime";
    const nameOf = (id: string | null) => (id ? topology.devices.find(device => device.id === id)?.name ?? id : "—");
    const to = "to" in request ? request.to : "";
    const previous = state.log;
    const entry: LogRun = {
      id: (previous[previous.length - 1]?.id ?? 0) + 1,
      at: Date.now(), kind: request.kind,
      from: request.from, fromName: nameOf(request.from), to, outcome: run.outcome,
      events: run.events.map(event => ({ ...event, fromName: nameOf(event.from), toName: nameOf(event.to) })),
    };
    // the oldest runs go once the log holds too many frames
    const log = [...previous, entry];
    while(log.length > 1 && log.reduce((sum, item) => sum + item.events.length, 0) > LOG_MAX_EVENTS) log.shift();
    // an address obtained by DHCP stays in the topology (one undo step), the run with it
    const leased = run.lease ? applyLease(topology, run.lease) : null;
    set({
      log,
      run, request,
      draft: { ...state.draft, kind: request.kind, from: request.from, ...(to ? { targets: { ...state.draft.targets, [request.kind]: to } } : {}) },
      step: simulation ? 0 : run.events.length - 1,
      playing: simulation && run.events.length > 1,
      tab: "simulation",
      ...(leased ? { topology: leased, past: [...state.past, topology].slice(-HISTORY_LIMIT), future: [] } : {}),
    });
    get().notify(run.outcome.message, run.outcome.ok ? "ok" : "error");
  },
  runPing: (from, to, ttl = 64) => get().runSim({ kind: "ping", from, to, ttl }),
  setDraft: draft => set(state => ({ draft: { ...state.draft, ...draft } })),
  clearRun: () => set({ run: null, request: null, step: -1, playing: false }),
  setStep: step => set(state => ({ step: Math.max(-1, Math.min(step, (state.run?.events.length ?? 0) - 1)) })),
  setPlaying: playing => set({ playing }),
  toggleFilter: protocol => set(state => ({ filters: { ...state.filters, [protocol]: !state.filters[protocol] } })),
  notify: (text, kind = "info") => set({ toast: { id: ++toastId, text, kind } }),
  setAdding: adding => set({ adding }),
  setSideWidth: (width, save = false) => {
    const max = Math.max(SIDE_MIN, Math.round(window.innerWidth * .7));
    const sideWidth = Math.round(Math.min(max, Math.max(SIDE_MIN, width)));
    if(save){ try{ localStorage.setItem(SIDE_KEY, String(sideWidth)); }catch(_){ /* ignore */ } }
    set({ sideWidth });
  },
  setSideFull: sideFull => set({ sideFull }),
  setSideFloating: sideFloating => {
    saveSideFloat(sideFloating, get().sideFloat);
    set({ sideFloating, sideFull: false });
  },
  setSideFloat: change => {
    const sideFloat = { ...get().sideFloat, ...change };
    saveSideFloat(get().sideFloating, sideFloat);
    set({ sideFloat });
  },
  clearLog: () => set({ log: [] }),
  toggleLog: () => {
    const layout = get().logLayout;
    get().setLogLayout({ dock: layout.dock === "hidden" ? layout.last : "hidden" });
  },
  setLogLayout: change => set(state => {
    const logLayout = { ...state.logLayout, ...change, float: { ...state.logLayout.float, ...change.float } };
    if(change.dock && change.dock !== "hidden") logLayout.last = change.dock;
    try{ localStorage.setItem(LOG_KEY, JSON.stringify(logLayout)); }catch(_){ /* ignore */ }
    return { logLayout };
  }),
}));

// every change is saved in its lab, a moment later (and before leaving it)
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let unsaved: { id: string; topology: Topology } | null = null;
function flushSave(){
  clearTimeout(saveTimer);
  if(!unsaved) return;
  const { id, topology } = unsaved;
  unsaved = null;
  useStore.setState({ labs: saveLab(id, topology) });
}
useStore.subscribe((state, previous) => {
  if(state.topology === previous.topology || state.labId !== previous.labId) return;
  unsaved = { id: state.labId, topology: state.topology };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 400);
});
window.addEventListener("pagehide", flushSave);

/** Removes the selected device (with its cables) or cable. */
export function deleteSelection(){
  const state = useStore.getState();
  const selection = state.selection;
  if(!selection) return;
  const ids = new Set([selection.id]);
  state.commit(selection.kind === "device" ? removeDevices(state.topology, ids) : removeLinks(state.topology, ids));
  state.select(null);
}


