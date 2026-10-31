// An exercise's avatar, as a machine's: a disc in the colour of its topic with
// its device's icon, inside a ring in the colour of its level (green, amber,
// red), the ring full when it is solved.
import { BOX_COLOR, type Exercise } from "@visual-tracert/model";
import { useId } from "react";
import { Icon } from "../editor/icons";

const RING = { 1: "var(--ok)", 2: "var(--arp)", 3: "var(--danger)" } as const;

export function MachineAvatar({ exercise, size = 48, solved = false }: { exercise: Exercise; size?: number; solved?: boolean }) {
  const id = useId();
  const color = BOX_COLOR[exercise.box];
  return (
    <span className={`machine-avatar${solved ? " solved" : ""}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 48 48">
        <defs>
          <radialGradient id={`${id}-glow`} cx="35%" cy="30%" r="75%">
            <stop offset="0" stopColor={color} stopOpacity=".95" />
            <stop offset="1" stopColor={color} stopOpacity=".55" />
          </radialGradient>
        </defs>
        <circle cx="24" cy="24" r="22" fill="none" stroke={RING[exercise.level]} strokeWidth="3" strokeDasharray={solved ? undefined : "4 3"} />
        <circle cx="24" cy="24" r="18" fill={`url(#${id}-glow)`} />
        <circle cx="17" cy="15" r="6" fill="#fff" opacity=".18" />
      </svg>
      <span className="machine-avatar-icon"><Icon name={exercise.icon} size={Math.round(size * .42)} /></span>
    </span>
  );
}
