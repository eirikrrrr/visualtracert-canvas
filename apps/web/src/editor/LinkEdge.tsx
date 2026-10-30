// A cable between two devices, drawn from tile to tile whatever handle it
// was made from, with a port dot at each end. While a simulation is played,
// the frame of the current event travels along it.
import { BaseEdge, EdgeLabelRenderer, useInternalNode, type Edge, type EdgeProps, type InternalNode } from "@xyflow/react";
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
const PACKET_SECONDS = 0.6;

function tileCenter(node: InternalNode) {
  const { x, y } = node.internals.positionAbsolute;
  return { x: x + TILE / 2, y: y + TILE / 2 };
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
  if(!a || !b || !data) return null;
  const ca = tileCenter(a), cb = tileCenter(b);
  const pa = border(ca, cb), pb = border(cb, ca);
  const path = `M${pa.x},${pa.y} L${pb.x},${pb.y}`;
  const packet = data.packet;
  const travel = packet && (packet.towards === "b" ? path : `M${pb.x},${pb.y} L${pa.x},${pa.y}`);
  const labelAt = (p: { x: number; y: number }, q: { x: number; y: number }) => ({ x: p.x + (q.x - p.x) * .18, y: p.y + (q.y - p.y) * .18 });
  const la = labelAt(pa, pb), lb = labelAt(pb, pa);

  return (
    <>
      <BaseEdge id={id} path={path} className={`link${selected ? " selected" : ""}${packet ? " active" : ""}`} interactionWidth={16} />
      <circle className="port" cx={pa.x} cy={pa.y} r={4} />
      <circle className="port" cx={pb.x} cy={pb.y} r={4} />
      {packet && travel && <Packet key={packet.key} path={travel} protocol={packet.protocol} dropped={packet.dropped} />}
      {selected && (
        <EdgeLabelRenderer>
          <span className="port-label" style={{ transform: `translate(-50%,-50%) translate(${la.x}px,${la.y}px)` }}>{data.aInterface}</span>
          <span className="port-label" style={{ transform: `translate(-50%,-50%) translate(${lb.x}px,${lb.y}px)` }}>{data.bInterface}</span>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const LinkEdge = memo(LinkEdgeView);
