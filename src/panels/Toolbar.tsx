// Left toolbar: tools (select, ping), delete, view and history.
import { useReactFlow } from "@xyflow/react";
import { useMovable } from "../app/movable";
import { deleteSelection, useStore } from "../app/store";
import { FIT } from "../editor/Canvas";
import { Icon, type IconName } from "../editor/icons";
import { Grip } from "./Grip";

function Tool({ icon, label, keys, active, disabled, onClick }: {
  icon: IconName; label: string; keys?: string; active?: boolean; disabled?: boolean; onClick: () => void;
}) {
  const title = keys ? `${label} (${keys})` : label;
  return (
    <button type="button" className={`tool${active ? " active" : ""}`} title={title} aria-label={title}
      aria-pressed={active === undefined ? undefined : active} disabled={disabled} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
}

export function Toolbar() {
  const tool = useStore(state => state.tool);
  const selection = useStore(state => state.selection);
  const canUndo = useStore(state => state.past.length > 0);
  const canRedo = useStore(state => state.future.length > 0);
  const flow = useReactFlow();
  const setTool = useStore(state => state.setTool);
  const movable = useMovable<HTMLElement>("toolbar");

  return (
    <nav className="toolbar" aria-label="Herramientas" ref={movable.ref} style={movable.style}>
      <Grip {...movable.grip} label="Mover la barra de herramientas" />
      <Tool icon="select" label="Seleccionar y mover" keys="V" active={tool === "select"} onClick={() => setTool("select")} />
      <Tool icon="ping" label="Ping: clic en el origen y luego en el destino" keys="P" active={tool === "ping"} onClick={() => setTool(tool === "ping" ? "select" : "ping")} />
      <Tool icon="trash" label="Eliminar la selección" keys="Supr" disabled={!selection} onClick={deleteSelection} />
      <span className="toolbar-sep" />
      <Tool icon="zoomIn" label="Acercar" onClick={() => flow.zoomIn({ duration: 200 })} />
      <Tool icon="zoomOut" label="Alejar" onClick={() => flow.zoomOut({ duration: 200 })} />
      <Tool icon="fit" label="Encuadrar" keys="F" onClick={() => flow.fitView({ ...FIT, duration: 300 })} />
      <span className="toolbar-sep" />
      <Tool icon="undo" label="Deshacer" keys="Ctrl+Z" disabled={!canUndo} onClick={() => useStore.getState().undo()} />
      <Tool icon="redo" label="Rehacer" keys="Ctrl+Y" disabled={!canRedo} onClick={() => useStore.getState().redo()} />
    </nav>
  );
}
