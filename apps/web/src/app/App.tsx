// The workspace: top bar, the canvas with its toolbar, device palette and
// inspector (the properties of what is selected), and the side panel (the
// mode's: emulation or simulation; the document). The user's dashboard, the
// gallery and the Marketplace open over it.
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Canvas, FIT } from "../editor/Canvas";
import { DocumentPanel } from "../panels/DocumentPanel";
import { LogPanel } from "../panels/LogPanel";
import { TemplateGallery } from "../panels/TemplateGallery";
import { Marketplace } from "../panels/Marketplace";
import { Palette } from "../panels/Palette";
import { Inspector } from "../panels/Inspector";
import { Dashboard } from "../panels/Dashboard";
import { DeviceWindows } from "../panels/DeviceWindow";
import { EmulationPanel } from "../emulation/EmulationPanel";
import { useImages } from "../emulation/images";
import { SimulationPanel } from "../panels/SimulationPanel";
import { Toolbar } from "../panels/Toolbar";
import { TopBar } from "../panels/TopBar";
import { Icon } from "../editor/icons";
import { Grip } from "../panels/Grip";
import { tx, useT } from "../i18n";
import { followPointer } from "./movable";
import { useProfile } from "./profile";
import { deleteSelection, SIDE_DEFAULT, useStore, type Tab } from "./store";

const TABS: { id: Tab; label: string }[] = [
  { id: "simulation", label: tx("Simulación") },
  { id: "document", label: tx("Documento") },
];

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || Boolean(target.closest(".monaco")));

function Shortcuts() {
  const flow = useReactFlow();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if(typing(event.target)) return;
      const state = useStore.getState();
      // the gallery and the Marketplace are modal dialogs: their own keys only
      if(state.gallery || state.marketplace || state.dashboard) return;
      const key = event.key.toLowerCase();
      if((event.ctrlKey || event.metaKey) && key === "z"){ event.preventDefault(); event.shiftKey ? state.redo() : state.undo(); return; }
      if((event.ctrlKey || event.metaKey) && key === "y"){ event.preventDefault(); state.redo(); return; }
      if(event.ctrlKey || event.metaKey || event.altKey) return;
      if(key === "delete" || key === "backspace"){ event.preventDefault(); deleteSelection(); }
      else if(key === "escape"){
        if(state.sideFull){ state.setSideFull(false); return; }
        state.setTool("select"); state.select(null); state.setInspectLab(false);
      }
      else if(key === "a" && !state.sideFull){ event.preventDefault(); state.setAdding(true); }
      else if(key === "l"){ event.preventDefault(); state.toggleLog(); }
      else if(key === "v") state.setTool("select");
      else if(key === "p") state.setTool("ping");
      else if(key === "c") state.setTool("capture");
      else if(key === "f") flow.fitView({ ...FIT, duration: 300 });
      else if(state.run && (key === "arrowright" || key === "arrowleft")){
        state.setPlaying(false);
        state.setStep(state.step + (key === "arrowright" ? 1 : -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flow]);

  // back from full screen: the canvas got its size again
  const full = useStore(state => state.sideFull);
  const first = useRef(true);
  useEffect(() => {
    if(first.current){ first.current = false; return; }
    if(!full) requestAnimationFrame(() => flow.fitView({ ...FIT, duration: 200 }));
  }, [full, flow]);
  return null;
}

// the left edge of the side panel: drag (or arrow keys) to change its width
function SideResizer() {
  const t = useT();
  const drag = useRef<{ x: number; width: number } | null>(null);
  const width = useStore(state => state.sideWidth);
  const set = (value: number, save = false) => useStore.getState().setSideWidth(value, save);
  return (
    <div className="side-resizer" role="separator" aria-orientation="vertical" aria-label={t("Ancho del panel")} tabIndex={0}
      aria-valuenow={width} title={t("Arrastra para cambiar el ancho · doble clic: ancho normal")}
      onPointerDown={event => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width };
        document.body.classList.add("resizing");
      }}
      onPointerMove={event => { if(drag.current) set(drag.current.width - (event.clientX - drag.current.x)); }}
      onPointerUp={() => {
        if(!drag.current) return;
        drag.current = null;
        document.body.classList.remove("resizing");
        set(useStore.getState().sideWidth, true);
      }}
      onDoubleClick={() => set(SIDE_DEFAULT, true)}
      onKeyDown={event => {
        if(event.key === "ArrowLeft"){ event.preventDefault(); set(width + 24, true); }
        if(event.key === "ArrowRight"){ event.preventDefault(); set(width - 24, true); }
      }} />
  );
}

function Toasts() {
  const toast = useStore(state => state.toast);
  useEffect(() => {
    if(!toast) return;
    const timer = setTimeout(() => {
      if(useStore.getState().toast?.id === toast.id) useStore.setState({ toast: null });
    }, toast.kind === "error" ? 6000 : 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  if(!toast) return null;
  return <div key={toast.id} className={`toast toast-${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"}>{toast.text}</div>;
}

const FLOAT_MIN = { width: 340, height: 300 };

function SidePanel() {
  const t = useT();
  const tab = useStore(state => state.tab);
  const events = useStore(state => state.run?.events.length ?? 0);
  const emulating = useStore(state => state.mode === "emulation");
  const full = useStore(state => state.sideFull);
  const floating = useStore(state => state.sideFloating) && !full;
  const float = useStore(state => state.sideFloat);
  const aside = useRef<HTMLElement>(null);
  const store = useStore.getState;

  // first time undocked: near the right edge of the workspace
  const workspaceWidth = () => aside.current?.parentElement?.clientWidth ?? window.innerWidth;
  const x = float.x < 0 ? Math.max(0, workspaceWidth() - float.width - 24) : float.x;

  const move = (event: ReactPointerEvent) => {
    const origin = { x, y: float.y };
    const parent = aside.current?.parentElement;
    followPointer(event, (dx, dy) => {
      const maxX = (parent?.clientWidth ?? 1200) - (aside.current?.offsetWidth ?? 400);
      const maxY = (parent?.clientHeight ?? 800) - 48;
      store().setSideFloat({ x: Math.round(Math.min(Math.max(0, origin.x + dx), Math.max(0, maxX))), y: Math.round(Math.min(Math.max(0, origin.y + dy), Math.max(0, maxY))) });
    });
  };

  // the corner of the window resizes it (CSS resize): keep its size
  useEffect(() => {
    const element = aside.current;
    if(!floating || !element || !window.ResizeObserver) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const width = Math.round(element.offsetWidth), height = Math.round(element.offsetHeight);
        const saved = store().sideFloat;
        if(width !== saved.width || height !== saved.height) store().setSideFloat({ width, height });
      }, 150);
    });
    observer.observe(element);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [floating]);

  return (
    <aside ref={aside} className={`side${floating ? " side-floating" : ""}`}
      style={floating ? { left: x, top: float.y, width: Math.max(FLOAT_MIN.width, float.width), height: Math.max(FLOAT_MIN.height, float.height) } : undefined}>
      {!full && !floating && <SideResizer />}
      <div className="tabs" role="tablist" aria-label={t("Panel")}>
        {floating && <Grip vertical onPointerDown={move} label={t("Mover el panel")} title={t("Arrastra para mover el panel")} />}
        {TABS.map(item => (
          <button key={item.id} type="button" role="tab" id={`tab-${item.id}`} aria-selected={tab === item.id} aria-controls={`panel-${item.id}`}
            className={tab === item.id ? "active" : ""} onClick={() => useStore.getState().setTab(item.id)}>
            {item.id === "simulation" && emulating ? t("Emulación") : t(item.label)}
            {item.id === "simulation" && !emulating && events > 0 && <span className="badge">{events}</span>}
          </button>
        ))}
        <button type="button" className="icon-button side-expand" aria-pressed={floating}
          title={floating ? t("Acoplar a la derecha") : t("Desacoplar (ventana flotante)")} aria-label={floating ? t("Acoplar") : t("Desacoplar")}
          onClick={() => store().setSideFloating(!floating)}>
          <Icon name={floating ? "dock" : "undock"} size={17} />
        </button>
        <button type="button" className="icon-button side-full-button" aria-pressed={full}
          title={full ? t("Volver al lienzo (Esc)") : t("Pantalla completa")} aria-label={full ? t("Volver al lienzo") : t("Pantalla completa")}
          onClick={() => useStore.getState().setSideFull(!full)}>
          <Icon name={full ? "restore" : "maximize"} size={17} />
        </button>
      </div>
      <div className="side-body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "document" && <DocumentPanel />}
        {tab === "simulation" && (emulating ? <EmulationPanel /> : <SimulationPanel />)}
      </div>
    </aside>
  );
}

export function App() {
  const t = useT();
  const theme = useStore(state => state.theme);
  const tool = useStore(state => state.tool);
  const pingFrom = useStore(state => state.pingFrom);
  const sideWidth = useStore(state => state.sideWidth);
  const sideFull = useStore(state => state.sideFull);
  const sideFloating = useStore(state => state.sideFloating);
  const motion = useProfile(state => state.motion ?? "full");
  useEffect(() => { document.body.dataset.theme = theme; }, [theme]);
  useEffect(() => { document.body.dataset.motion = motion; }, [motion]);
  // what images this server has: the palette offers their devices
  useEffect(() => { void useImages.getState().refresh(); }, []);

  return (
    <ReactFlowProvider>
      <Shortcuts />
      <div className="app">
        <TopBar />
        <main className={`workspace${sideFull ? " side-full" : sideFloating ? " side-undocked" : ""}`} style={{ "--side-width": `${sideWidth}px` } as CSSProperties}>
          <div className="stage">
            <div className="canvas-area">
            <Canvas />
            <Toolbar />
            <Palette />
            {tool === "capture" && (
              <div className="banner" role="status">
                {t("Haz clic en un cable para capturar en él, o en un dispositivo para todas sus interfaces.")}
                <button type="button" className="link" onClick={() => useStore.getState().setTool("select")}>{t("Cancelar")}</button>
              </div>
            )}
            {tool === "ping" && (
              <div className="banner" role="status">
                {pingFrom ? t("Haz clic en el equipo de destino.") : t("Haz clic en el equipo que hace el ping.")}
                <button type="button" className="link" onClick={() => useStore.getState().setTool("select")}>{t("Cancelar")}</button>
              </div>
            )}
            <Inspector />
            <DeviceWindows />
            <Toasts />
            </div>
            <LogPanel />
          </div>
          <SidePanel />
        </main>
      </div>
      <TemplateGallery />
      <Marketplace />
      <Dashboard />
    </ReactFlowProvider>
  );
}
