// A topology on the canvas: a translucent rectangle in its colour around its
// devices, with its name and status on top (dragged from there, it moves
// with all of them) and its note below. Clicks elsewhere in it reach the
// canvas, so the canvas still pans and selects through it.
import type { Node, NodeProps } from "@xyflow/react";
import { ZONE_COLORS, type TopologyStatus, type Zone } from "@visual-tracert/model";
import { memo, type CSSProperties } from "react";
import { tx, useT } from "../i18n";

export const STATUS_LABEL: Record<TopologyStatus, string> = { start: tx("Iniciada"), stop: tx("Detenida"), hybrid: tx("Híbrida") };

export type ZoneNodeData = {
  zone: Zone;
  width: number;
  height: number;
  empty: boolean;
  selected: boolean;
};

export type ZoneNodeType = Node<ZoneNodeData, "zone">;

export const ZONE_NODE = "zone:";

function ZoneNodeView({ data }: NodeProps<ZoneNodeType>) {
  const t = useT();
  const { zone, width, height, empty, selected } = data;
  return (
    <div className={`zone${selected ? " selected" : ""}`} style={{ width, height, "--zone": zone.color ?? ZONE_COLORS[0] } as CSSProperties}>
      <div className="zone-head" title={t("Arrastra para mover la topología con sus dispositivos · clic: sus propiedades")}>
        <span className="zone-dot" aria-hidden="true" />
        <strong>{zone.name}</strong>
        <span className={`zone-status status-${zone.status}`}>{t(STATUS_LABEL[zone.status])}</span>
      </div>
      {empty && <p className="zone-empty">{t("Topología vacía: suelta aquí dispositivos.")}</p>}
      {zone.text && <p className="zone-text">{zone.text}</p>}
    </div>
  );
}

export const ZoneNode = memo(ZoneNodeView);
