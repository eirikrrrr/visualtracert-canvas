// A device on the canvas: its icon in a tile, its name and main address.
// Cables start from any of the four handles around the tile.
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { useT } from "../i18n";
import { CATALOG, type Device } from "@visual-tracert/model";
import { Icon } from "./icons";

export const TILE = 56;

export type DeviceNodeData = {
  device: Device;
  /** "current": the device the event being played arrives at; "source": where the ping starts */
  mark: "current" | "source" | "picked" | null;
  dropped: boolean;
};

export type DeviceNodeType = Node<DeviceNodeData, "device">;

function DeviceNodeView({ data, selected }: NodeProps<DeviceNodeType>) {
  const { device, mark, dropped } = data;
  const t = useT();
  const main = device.interfaces.find(iface => iface.ip);
  const classes = ["device", `device-${device.type}`, selected && "selected", mark && `mark-${mark}`, dropped && "dropped"]
    .filter(Boolean).join(" ");
  return (
    <div className={classes} title={`${device.name} · ${t(CATALOG[device.type].label)}`}>
      <div className="device-tile" style={{ width: TILE, height: TILE }}>
        <Icon name={device.type} size={26} />
        {(["Top", "Right", "Bottom", "Left"] as const).map(side => (
          <Handle key={side} id={side} type="source" position={Position[side]} className="device-handle" />
        ))}
      </div>
      <div className="device-text">
        <strong>{device.name}</strong>
        <span>{main ? `${main.ip}/${main.prefix}` : t(CATALOG[device.type].label)}</span>
      </div>
    </div>
  );
}

export const DeviceNode = memo(DeviceNodeView);
