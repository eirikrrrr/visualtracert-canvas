// App state: the topology (with undo/redo), what is selected, the tool, the
// mode and the simulation being played back. The topology is the single
// source of truth: the canvas, the properties panel and the document are
// views of it, and every change goes through commit().
import { create } from "zustand";
import { exampleTopology } from "../model/example";
import { emptyTopology, removeDevices, removeLinks } from "../model/topology";
import type { Topology } from "../model/types";
import { simulatePing, type Protocol, type SimEvent, type SimOutcome, type SimRun } from "../sim/engine";
import { deleteLab, listLabs, loadLab, newLabId, saveLab, setCurrentLabId, startingLab, type LabMeta } from "./labs";

const THEME_KEY = "visor-tracert.theme";
const HISTORY_LIMIT = 100;
const SIDE_KEY = "visor-tracert.side-width";
const SIDE_FLOAT_KEY = "visor-tracert.side-float";
export interface SideFloat { x: number; y: number; width: number; height: number }
const SIDE_FLOAT_DEFAULT: SideFloat = { x: -1, y: 16, width: 420, height: 640 };
export const SIDE_DEFAULT = 380;
export const SIDE_MIN = 320;

export type Selection = { kind: "device" | "link"; id: string } | null;
export type Tool = "select" | "ping";
export type Mode = "realtime" | "simulation";
export type Tab = "properties" | "document" | "simulation";
export type Theme = "azul" | "marron" | "editorial" | "morado";

export const THEMES: { id: Theme; label: string; light: boolean; swatch: [string, string, string] }[] = [
  { id: "azul", label: "Azul", light: false, swatch: ["#0d0d0e", "#1b1b1d", "#3d7eff"] },
  { id: "marron", label: "Marrón", light: false, swatch: ["#100c09", "#211a15", "#c8834b"] },
  { id: "editorial", label: "Editorial", light: true, swatch: ["#f5f3ee", "#ffffff", "#b3261e"] },
  { id: "morado", label: "Morado", light: false, swatch: ["#0c0a10", "#1c1823", "#9b6dff"] },
];

export const isLightTheme = (theme: Theme) => THEMES.find(item => item.id === theme)?.light ?? false;

/** A ping recorded in the log, with every frame it produced. */
export interface LogRun {
  id: number;
  at: number;
  from: string;
  fromName: string;
  to: string;
  outcome: SimOutcome;
  events: (SimEvent & { fromName: string; toName: string })[];
}

export type LogDock = "docked" | "floating" | "hidden";
export interface LogLayout {
  dock: LogDock;
  /** how it was shown before it was hidden */
  last: "docked" | "floating";
  height: number;
  float: { x: number; y: number; width: number; height: number };
}

const LOG_KEY = "visor-tracert.log-layout";
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
  tab: Tab;
  theme: Theme;
  run: SimRun | null;
  /** origin and destination chosen in the simulation panel */
  draft: { from: string; to: string; ttl: number };
  ping: { from: string; to: string; ttl: number } | null;
  /** index of the event shown on the canvas, -1 before the first */
  step: number;
  playing: boolean;
  filters: Record<Protocol, boolean>;
  toast: Toast | null;
  /** the "add a device" list is open */
  adding: boolean;
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
  removeLab: (id: string) => void;
  select: (selection: Selection) => void;
  setTool: (tool: Tool) => void;
  setPingFrom: (id: string | null) => void;
  setMode: (mode: Mode) => void;
  setTab: (tab: Tab) => void;
  setTheme: (theme: Theme) => void;
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
  const topology = exampleTopology();
  const labs = saveLab(id, topology);
  setCurrentLabId(id);
  return { id, topology, labs };
}
const opening = openingLab();

// what a fresh lab starts with: no history, nothing selected, no simulation
const freshLab = { past: [], future: [], selection: null, run: null, ping: null, step: -1, playing: false, pingFrom: null };

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
  tab: "properties",
  theme: loadTheme(),
  run: null,
  draft: { from: "", to: "", ttl: 64 },
  ping: null,
  step: -1,
  playing: false,
  filters: { ARP: true, ICMP: true },
  toast: null,
  adding: false,
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
    if(!topology){ get().notify("No se pudo abrir ese laboratorio.", "error"); return; }
    setCurrentLabId(id);
    set({ labId: id, topology, ...freshLab });
  },
  createLab: from => {
    flushSave();
    const current = get().topology;
    const topology: Topology = from === "example" ? exampleTopology()
      : from === "duplicate" ? { ...current, name: `${current.name} (copia)` }
      : emptyTopology();
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
      const empty = emptyTopology();
      setCurrentLabId(fresh);
      set({ labId: fresh, labs: saveLab(fresh, empty), topology: empty, ...freshLab });
    }
  },
  select: selection => set({ selection }),
  setTool: tool => set({ tool, pingFrom: null }),
  setPingFrom: pingFrom => set({ pingFrom }),
  setMode: mode => set({ mode, playing: false }),
  setTab: tab => set({ tab }),
  setTheme: theme => {
    try{ localStorage.setItem(THEME_KEY, theme); }catch(_){ /* ignore */ }
    set({ theme });
  },
  runPing: (from, to, ttl = 64) => {
    const topology = get().topology;
    const run = simulatePing(topology, { from, to, ttl });
    const simulation = get().mode === "simulation";
    const nameOf = (id: string | null) => (id ? topology.devices.find(device => device.id === id)?.name ?? id : "—");
    const previous = get().log;
    const entry: LogRun = {
      id: (previous[previous.length - 1]?.id ?? 0) + 1,
      at: Date.now(), from, fromName: nameOf(from), to, outcome: run.outcome,
      events: run.events.map(event => ({ ...event, fromName: nameOf(event.from), toName: nameOf(event.to) })),
    };
    // the oldest pings go once the log holds too many frames
    const log = [...previous, entry];
    while(log.length > 1 && log.reduce((sum, item) => sum + item.events.length, 0) > LOG_MAX_EVENTS) log.shift();
    set({
      log,
      run, ping: { from, to, ttl }, draft: { from, to, ttl },
      step: simulation ? 0 : run.events.length - 1,
      playing: simulation && run.events.length > 1,
      tab: "simulation",
    });
    get().notify(run.outcome.message, run.outcome.ok ? "ok" : "error");
  },
  setDraft: draft => set(state => ({ draft: { ...state.draft, ...draft } })),
  clearRun: () => set({ run: null, ping: null, step: -1, playing: false }),
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


