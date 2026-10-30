// The dotted handle a bar or a window is moved by.
import type { HTMLAttributes } from "react";

export function Grip({ vertical, label = "Mover", ...props }: HTMLAttributes<HTMLSpanElement> & { vertical?: boolean; label?: string }) {
  const dots = vertical ? [[8, 5], [16, 5], [8, 12], [16, 12], [8, 19], [16, 19]] : [[5, 8], [12, 8], [19, 8], [5, 16], [12, 16], [19, 16]];
  return (
    <span className={`grip${vertical ? " grip-vertical" : ""}`} role="button" aria-label={label} {...props}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        {dots.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} />)}
      </svg>
    </span>
  );
}
