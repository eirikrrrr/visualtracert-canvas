// The canvas: the topology drawn with React Flow. Positions live in the
// topology; React Flow keeps its own node list (with sizes) in sync with it.
// Selection is the app's (store), not React Flow's.
import {
  Background, BackgroundVariant, ConnectionMode, MiniMap, ReactFlow, applyNodeChanges, useReactFlow,
  type Connection, type NodeChange, type NodeMouseHandler, type EdgeMouseHandler,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { isLightTheme, useStore } from "../app/store";
import { CATALOG } from "../model/catalog";
import { addDevice, connect, moveDevices } from "../model/topology";
import type { DeviceType } from "../model/types";
import { addressOf } from "../sim/engine";
import { DeviceNode, TILE, type DeviceNodeType } from "./DeviceNode";
import { LinkEdge, type LinkEdgeType } from "./LinkEdge";

export const DEVICE_DRAG_TYPE = "application/x-visor-device";
// a lab of one or two devices is not blown up to fill the canvas
export const FIT = { padding: 0.2, maxZoom: 1.2 };

const nodeTypes = { device: DeviceNode };
const edgeTypes = { link: LinkEdge };

export function Canvas() {
  const topology = useStore(state => state.topology);
  const selection = useStore(state => state.selection);
  const tool = useStore(state => state.tool);
  const pingFrom = useStore(state => state.pingFrom);
  const run = useStore(state => state.run);
  const step = useStore(state => state.step);
  const ping = useStore(state => state.ping);
  const theme = useStore(state => state.theme);
  const labId = useStore(state => state.labId);
  const { screenToFlowPosition, fitView } = useReactFlow();

  // another lab: frame it once its devices are drawn
  useEffect(() => {
    const timer = setTimeout(() => fitView(FIT), 60);
    return () => clearTimeout(timer);
  }, [labId, fitView]);

  const current = run && step >= 0 ? run.events[step] : null;

  const [nodes, setNodes] = useState<DeviceNodeType[]>([]);
  useEffect(() => {
    setNodes(previous => {
      const known = new Map(previous.map(node => [node.id, node]));
      return topology.devices.map(device => {
        const mark: DeviceNodeType["data"]["mark"] =
          current && current.to === device.id ? "current"
            : pingFrom === device.id ? "picked"
            : ping && run && ping.from === device.id ? "source"
            : null;
        return {
          ...known.get(device.id),
          id: device.id,
          type: "device",
          position: device.position,
          selected: selection?.kind === "device" && selection.id === device.id,
          data: { device, mark, dropped: Boolean(current && current.to === device.id && current.result === "dropped") },
        } as DeviceNodeType;
      });
    });
  }, [topology, selection, current, pingFrom, ping, run]);

  const edges = useMemo<LinkEdgeType[]>(() => topology.links.map(link => {
    const crossing = current && current.link === link.id && current.from;
    return {
      id: link.id,
      type: "link",
      source: link.a.device,
      target: link.b.device,
      selected: selection?.kind === "link" && selection.id === link.id,
      data: {
        aInterface: link.a.interface,
        bInterface: link.b.interface,
        packet: crossing ? {
          towards: current.to === link.b.device ? "b" : "a",
          protocol: current.protocol,
          key: current.index,
          dropped: current.result === "dropped",
        } : null,
      },
    };
  }), [topology.links, selection, current]);

  // drags change React Flow's copy; the topology gets the positions at the end
  const onNodesChange = useCallback((changes: NodeChange<DeviceNodeType>[]) => {
    setNodes(previous => applyNodeChanges(changes.filter(change => change.type !== "select" && change.type !== "remove"), previous));
  }, []);
  const onNodeDragStart = useCallback(() => useStore.getState().beginGesture(), []);
  const onNodeDragStop = useCallback((_: unknown, __: unknown, dragged: DeviceNodeType[]) => {
    const state = useStore.getState();
    state.setLive(moveDevices(state.topology, new Map(dragged.map(node => [node.id, node.position]))));
    state.endGesture();
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    const state = useStore.getState();
    const result = connect(state.topology, connection.source, connection.target);
    if("error" in result){ state.notify(result.error, "error"); return; }
    state.commit(result.topology);
    state.select({ kind: "link", id: result.link.id });
  }, []);

  const onNodeClick = useCallback<NodeMouseHandler<DeviceNodeType>>((_, node) => {
    const state = useStore.getState();
    if(state.tool !== "ping"){ state.select({ kind: "device", id: node.id }); return; }
    const device = state.topology.devices.find(item => item.id === node.id);
    if(!state.pingFrom){
      if(!addressOf(device)){ state.notify(`${device?.name} no tiene dirección IP: no puede hacer ping.`, "error"); return; }
      state.setPingFrom(node.id);
      state.notify(`Origen: ${device?.name}. Ahora haz clic en el destino.`);
      return;
    }
    const to = addressOf(device);
    if(!to){ state.notify(`${device?.name} no tiene dirección IP: elige otro destino.`, "error"); return; }
    const from = state.pingFrom;
    state.setPingFrom(null);
    state.setTool("select");
    state.runPing(from, to);
  }, []);

  const onEdgeClick = useCallback<EdgeMouseHandler<LinkEdgeType>>((_, edge) => {
    useStore.getState().select({ kind: "link", id: edge.id });
  }, []);

  const onPaneClick = useCallback(() => {
    const state = useStore.getState();
    state.select(null);
    if(state.pingFrom) state.setPingFrom(null);
  }, []);

  // devices dropped from the palette
  const onDragOver = useCallback((event: DragEvent) => {
    if(!event.dataTransfer.types.includes(DEVICE_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);
  const onDrop = useCallback((event: DragEvent) => {
    const type = event.dataTransfer.getData(DEVICE_DRAG_TYPE) as DeviceType;
    if(!CATALOG[type]) return;
    event.preventDefault();
    const at = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const state = useStore.getState();
    const { topology: next, device } = addDevice(state.topology, type, { x: at.x - TILE / 2, y: at.y - TILE / 2 });
    state.commit(next);
    state.select({ kind: "device", id: device.id });
  }, [screenToFlowPosition]);

  return (
    <div className={`canvas tool-${tool}`} onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow<DeviceNodeType, LinkEdgeType>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        connectionMode={ConnectionMode.Loose}
        deleteKeyCode={null}
        nodesDraggable={tool === "select"}
        colorMode={isLightTheme(theme) ? "light" : "dark"}
        minZoom={0.2}
        maxZoom={2.5}
        fitView
        fitViewOptions={FIT}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} />
        <MiniMap pannable zoomable position="top-right" className="minimap" nodeBorderRadius={10} />
      </ReactFlow>
    </div>
  );
}
