// The canvas: the topology drawn with React Flow. Positions live in the
// topology; React Flow keeps its own node list (with sizes) in sync with it.
// Selection is the app's (store), not React Flow's. The topologies of the lab
// are nodes too, under the devices: rectangles drawn around them (unless the
// lab turns its decorations off), dragged by their title with their devices.
// A device dropped inside another topology's rectangle moves to it.
import {
  Background, BackgroundVariant, ConnectionMode, MiniMap, ReactFlow, applyNodeChanges, useReactFlow,
  type Connection, type NodeChange, type NodeMouseHandler, type EdgeMouseHandler,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { CHALLENGE_SPACE, isLightTheme, selectedZone, useStore } from "../app/store";
import { addDevice, CATALOG, connect, decorated, devicesOf, isStarted, moveDevices, moveToZone, updateZone, zoneOf, type DeviceType } from "@visual-tracert/model";
import { useLiveAddresses } from "../emulation/live";
import { useEmulation } from "../emulation/store";
import { t } from "../i18n";
import { useProgress } from "../practice/progress";
import { addressOf } from "../sim/engine";
import { DeviceNode, TILE, type DeviceNodeType } from "./DeviceNode";
import { LinkEdge, type LinkEdgeType } from "./LinkEdge";
import { ZONE_NODE, ZoneNode, type ZoneNodeType } from "./ZoneNode";
import { DEVICE_BOX, zoneAt, zoneForNew, zoneRects, type ZoneRect } from "./zones";

type AppNode = DeviceNodeType | ZoneNodeType;
const isZone = (id: string) => id.startsWith(ZONE_NODE);

/** a capture on a device's port, in its window (the emulation is where it runs) */
export function openCapture(device: string, iface: string) {
  const state = useStore.getState();
  if(state.mode !== "emulation") state.notify(t("La captura es de tráfico real: cambia a Emulación y despliega el laboratorio."));
  state.openWindow(device, "capture", undefined, iface);
}

export const DEVICE_DRAG_TYPE = "application/x-visual-device";
// a lab of one or two devices is not blown up to fill the canvas
export const FIT = { padding: 0.2, maxZoom: 1.2 };

const nodeTypes = { device: DeviceNode, zone: ZoneNode };
const edgeTypes = { link: LinkEdge };

export function Canvas() {
  const topology = useStore(state => state.topology);
  const selection = useStore(state => state.selection);
  const tool = useStore(state => state.tool);
  const pingFrom = useStore(state => state.pingFrom);
  const run = useStore(state => state.run);
  const step = useStore(state => state.step);
  const request = useStore(state => state.request);
  const theme = useStore(state => state.theme);
  const labId = useStore(state => state.labId);
  const emulating = useStore(state => state.mode === "emulation");
  const { screenToFlowPosition, fitView } = useReactFlow<AppNode, LinkEdgeType>();

  // another lab: frame it once its devices are drawn (an exercise's, clear of
  // its challenge card on the left)
  const challenge = useProgress(state => Boolean(state.labs[labId]));
  useEffect(() => {
    const timer = setTimeout(() => fitView(challenge ? { ...FIT, padding: { top: "60px", right: "60px", bottom: "110px", left: `${CHALLENGE_SPACE + 90}px` } } : FIT), 60);
    return () => clearTimeout(timer);
  }, [labId, challenge, fitView]);

  const current = run && step >= 0 ? run.events[step] : null;

  // emulating a deployed lab: the addresses its devices have now
  const deployed = useEmulation(state => Boolean(state.lab?.deployed && state.lab.lab === labId));
  const live = useLiveAddresses(labId, emulating && deployed);

  const [nodes, setNodes] = useState<DeviceNodeType[]>([]);
  useEffect(() => {
    setNodes(previous => {
      const known = new Map(previous.map(node => [node.id, node]));
      return topology.devices.map(device => {
        const mark: DeviceNodeType["data"]["mark"] =
          current && current.to === device.id ? "current"
            : pingFrom === device.id ? "picked"
            : request && run && request.from === device.id ? "source"
            : null;
        return {
          ...known.get(device.id),
          id: device.id,
          type: "device",
          position: device.position,
          selected: selection?.kind === "device" && selection.id === device.id,
          data: {
            device, mark, dropped: Boolean(current && current.to === device.id && current.result === "dropped"),
            // emulating, what its topology does not start is shown off
            idle: emulating && !isStarted(topology, device),
            ...(live[device.id] ? { live: live[device.id] } : {}),
          },
        } as DeviceNodeType;
      });
    });
  }, [topology, selection, current, pingFrom, request, run, emulating, live]);

  // the topologies: around the devices as they are now (also mid-drag), or
  // where an empty one is being dragged
  const [emptyAt, setEmptyAt] = useState<Record<string, { x: number; y: number }>>({});
  const rects = useMemo<ZoneRect[]>(() => {
    const byId = new Map(nodes.map(node => [node.id, node]));
    return zoneRects(topology, device => {
      const node = byId.get(device.id);
      return {
        ...(node?.position ?? device.position),
        width: node?.measured?.width ?? DEVICE_BOX.width,
        height: node?.measured?.height ?? DEVICE_BOX.height,
      };
    }, zone => emptyAt[zone.id]);
  }, [topology, nodes, emptyAt]);
  const shown = decorated(topology);
  const zoneNodes = useMemo<ZoneNodeType[]>(() => !shown ? [] : rects.map(rect => ({
    id: ZONE_NODE + rect.zone.id,
    type: "zone",
    position: { x: rect.x, y: rect.y },
    zIndex: -1,
    dragHandle: ".zone-head",
    selectable: false,
    connectable: false,
    deletable: false,
    data: { zone: rect.zone, width: rect.width, height: rect.height, empty: rect.empty, selected: selection?.kind === "zone" && selection.id === rect.zone.id },
  })), [rects, shown, selection]);
  const allNodes = useMemo<AppNode[]>(() => [...zoneNodes, ...nodes], [zoneNodes, nodes]);

  // what the drag handlers need now, not when they were made
  const latest = useRef({ nodes, rects, emptyAt });
  latest.current = { nodes, rects, emptyAt };

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
  // a topology dragged: its devices go with it (an empty one, by itself)
  const onNodesChange = useCallback((changes: NodeChange<AppNode>[]) => {
    const own = (change: NodeChange<AppNode>) => "id" in change && isZone(change.id);
    for(const change of changes){
      if(change.type !== "position" || !own(change) || !change.position) continue;
      const id = change.id.slice(ZONE_NODE.length);
      const rect = latest.current.rects.find(item => item.zone.id === id);
      if(!rect) continue;
      if(rect.empty){ setEmptyAt(previous => ({ ...previous, [id]: change.position! })); continue; }
      const dx = change.position.x - rect.x, dy = change.position.y - rect.y;
      const members = new Set(devicesOf(useStore.getState().topology, id).map(device => device.id));
      setNodes(previous => previous.map(node => members.has(node.id) ? { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } } : node));
    }
    const rest = changes.filter(change => !own(change) && change.type !== "select" && change.type !== "remove") as NodeChange<DeviceNodeType>[];
    if(rest.length) setNodes(previous => applyNodeChanges(rest, previous));
  }, []);
  const onNodeDragStart = useCallback(() => useStore.getState().beginGesture(), []);
  const onNodeDragStop = useCallback((_: unknown, node: AppNode, dragged: AppNode[]) => {
    const state = useStore.getState();
    const { nodes: now, rects: drawn, emptyAt: left } = latest.current;
    if(isZone(node.id)){
      const id = node.id.slice(ZONE_NODE.length);
      const members = new Set(devicesOf(state.topology, id).map(device => device.id));
      const moved = moveDevices(state.topology, new Map(now.filter(item => members.has(item.id)).map(item => [item.id, item.position])));
      state.setLive(left[id] ? updateZone(moved, id, zone => ({ ...zone, position: { x: Math.round(left[id].x), y: Math.round(left[id].y) } })) : moved);
      setEmptyAt(previous => { const { [id]: _, ...others } = previous; return others; });
      state.endGesture();
      return;
    }
    const devices = dragged.filter(item => !isZone(item.id)) as DeviceNodeType[];
    let next = moveDevices(state.topology, new Map(devices.map(item => [item.id, item.position])));
    // dropped inside another topology: it moves to it
    if(decorated(next)){
      for(const item of devices){
        const device = next.devices.find(other => other.id === item.id);
        const own = device && zoneOf(next, device)?.id;
        const centre = { x: item.position.x + (item.measured?.width ?? DEVICE_BOX.width) / 2, y: item.position.y + (item.measured?.height ?? DEVICE_BOX.height) / 2 };
        const target = zoneAt(drawn.filter(rect => rect.zone.id !== own), centre);
        if(device && target) next = moveToZone(next, device.id, target.zone.id);
      }
    }
    state.setLive(next);
    state.endGesture();
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    const state = useStore.getState();
    const result = connect(state.topology, connection.source, connection.target, {}, t);
    if("error" in result){ state.notify(result.error, "error"); return; }
    state.commit(result.topology);
    state.select({ kind: "link", id: result.link.id });
  }, []);

  const onNodeClick = useCallback<NodeMouseHandler<AppNode>>((_, node) => {
    const state = useStore.getState();
    if(isZone(node.id)){
      if(state.tool === "select") state.select({ kind: "zone", id: node.id.slice(ZONE_NODE.length) });
      return;
    }
    // the capture tool on a device: all its ports
    if(state.tool === "capture"){ openCapture(node.id, "any"); return; }
    if(state.tool !== "ping"){ state.select({ kind: "device", id: node.id }); return; }
    const device = state.topology.devices.find(item => item.id === node.id);
    if(!state.pingFrom){
      if(!addressOf(device)){ state.notify(t("{device} no tiene dirección IP: no puede hacer ping.", { device: device?.name ?? "" }), "error"); return; }
      state.setPingFrom(node.id);
      state.notify(t("Origen: {device}. Ahora haz clic en el destino.", { device: device?.name ?? "" }));
      return;
    }
    const to = addressOf(device);
    if(!to){ state.notify(t("{device} no tiene dirección IP: elige otro destino.", { device: device?.name ?? "" }), "error"); return; }
    const from = state.pingFrom;
    state.setPingFrom(null);
    state.setTool("select");
    // emulating, the ping is a real one, run on the device's container
    if(state.mode === "emulation"){
      state.setTab("simulation");
      useEmulation.getState().run(state.labId, from, "ping", to);
      return;
    }
    state.runPing(from, to);
  }, []);

  // its window: properties, image and CLI
  const onNodeDoubleClick = useCallback<NodeMouseHandler<AppNode>>((_, node) => {
    if(useStore.getState().tool === "select" && !isZone(node.id)) useStore.getState().openWindow(node.id);
  }, []);

  const onEdgeClick = useCallback<EdgeMouseHandler<LinkEdgeType>>((_, edge) => {
    // the capture tool on a cable: the port of one of its ends
    if(useStore.getState().tool === "capture"){ openCapture(edge.source, edge.data!.aInterface); return; }
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
    const { topology: next, device } = addDevice(state.topology, type, { x: at.x - TILE / 2, y: at.y - TILE / 2 }, t, zoneForNew(state.topology, at, selectedZone(state)));
    state.commit(next);
    state.select({ kind: "device", id: device.id });
  }, [screenToFlowPosition]);

  return (
    <div className={`canvas tool-${tool}`} onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow<AppNode, LinkEdgeType>
        nodes={allNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        zoomOnDoubleClick={false}
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
        <MiniMap pannable zoomable position="bottom-right" className="minimap" nodeBorderRadius={10} />
      </ReactFlow>
    </div>
  );
}
