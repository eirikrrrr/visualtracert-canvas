// A cable between two devices, drawn from tile to tile whatever handle it
// was made from, with a port dot at each end and the name of the port by it
// (from where to where: Gi0/1 ── Fa0/1), unless the canvas is zoomed far
// out. While a simulation is played, the frame of the current event travels
// along it.
import { BaseEdge, EdgeLabelRenderer, useInternalNode, useStore as useFlow, type Edge, type EdgeProps, type InternalNode } from "@xyflow/react";
import { memo, useEffect, useRef } from "react";
import type { Protocol } from "../sim/engine";
import { TILE } from "./DeviceNode";

export type LinkEdgeData = {
  aInterface: string;
  bInterface: string;
  /** the frame crossing the cable now: from the source (a) or the target (b) */
  packet: { towards: "a" | "b"; protocol: Protocol; key: number; dropped: boolean } | null;
};

export type LinkEdgeType = Edge<LinkEdgeData, "link">;

const GAP = 6;
/** below this zoom the port names would only be noise */
const LABEL_ZOOM = 0.55;
const PACKET_SECONDS = 0.6;

function tileCenter(node: InternalNode) {
  const { x, y } = node.internals.positionAbsolute;
  return { x: x + TILE / 2, y: y + TILE / 2 };
}

/** how far along the line from a tile's centre it leaves the whole node:
 * the tile and its text (name, address, profile) beside it */
function leaves(node: InternalNode, from: { x: number; y: number }, ux: number, uy: number) {
  const { x, y } = node.internals.positionAbsolute;
  const width = node.measured.width ?? TILE, height = node.measured.height ?? TILE;
  const along = (low: number, high: number, origin: number, step: number) =>
    step > 0 ? (high - origin) / step : step < 0 ? (low - origin) / step : Infinity;
  return Math.min(along(x, x + width, from.x, ux), along(y, y + height, from.y, uy));
}

/** where the line from a's centre to b's centre leaves a's tile */
function border(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const half = TILE / 2 + GAP;
  const scale = half / Math.max(Math.abs(dx), Math.abs(dy), 1);
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}

// An animation inserted after the page loaded would start at the document's
// time zero, that is, already over: it is started when it mounts.
function Packet({ path, protocol, dropped }: { path: string; protocol: Protocol; dropped: boolean }) {
  const motion = useRef<SVGAnimateMotionElement>(null);
  useEffect(() => { motion.current?.beginElement(); }, []);
  return (
    <g className={`packet packet-${protocol.toLowerCase()}${dropped ? " packet-dropped" : ""}`}>
      <rect x={-9} y={-6.5} width={18} height={13} rx={2.5} />
      <path d="M-9 -6.5 L0 1 L9 -6.5" />
      <animateMotion ref={motion} begin="indefinite" dur={`${PACKET_SECONDS}s`} fill="freeze" path={path}
        calcMode="spline" keyTimes="0;1" keySplines=".4 0 .2 1" />
    </g>
  );
}

function LinkEdgeView({ id, source, target, data, selected }: EdgeProps<LinkEdgeType>) {
  const a = useInternalNode(source);
  const b = useInternalNode(target);
  const near = useFlow(state => state.transform[2] >= LABEL_ZOOM);
  if(!a || !b || !data) return null;
  const ca = tileCenter(a), cb = tileCenter(b);
  const pa = border(ca, cb), pb = border(cb, ca);
  const path = `M${pa.x},${pa.y} L${pb.x},${pb.y}`;
  const packet = data.packet;
  const travel = packet && (packet.towards === "b" ? path : `M${pb.x},${pb.y} L${pa.x},${pa.y}`);
  // just past the node it starts from (its text included, wherever the
  // cable leaves it), so neither covers the other; never past the middle
  const labelAt = (node: InternalNode, from: { x: number; y: number }, to: { x: number; y: number }, name: string) => {
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const ux = (to.x - from.x) / length, uy = (to.y - from.y) / length;
    // half the label, measured along the cable: about 7px a character, 18px tall
    const half = Math.abs(ux) * (name.length * 3.6 + 7) + Math.abs(uy) * 9;
    const along = Math.min(leaves(node, from, ux, uy) + half + 4, length / 2 - 4);
    return { x: from.x + ux * along, y: from.y + uy * along };
  };
  const la = labelAt(a, ca, cb, data.aInterface), lb = labelAt(b, cb, ca, data.bInterface);

  return (
    <>
      <BaseEdge id={id} path={path} className={`link${selected ? " selected" : ""}${packet ? " active" : ""}`} interactionWidth={16} />
      <circle className="port" cx={pa.x} cy={pa.y} r={4} />
      <circle className="port" cx={pb.x} cy={pb.y} r={4} />
      {packet && travel && <Packet key={packet.key} path={travel} protocol={packet.protocol} dropped={packet.dropped} />}
      {(near || selected) && (
        <EdgeLabelRenderer>
          <span className={`port-label${selected ? " selected" : ""}`} style={{ transform: `translate(-50%,-50%) translate(${la.x}px,${la.y}px)` }}>{data.aInterface}</span>
          <span className={`port-label${selected ? " selected" : ""}`} style={{ transform: `translate(-50%,-50%) translate(${lb.x}px,${lb.y}px)` }}>{data.bInterface}</span>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const LinkEdge = memo(LinkEdgeView);
