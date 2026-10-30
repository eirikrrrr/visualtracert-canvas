// Line icons drawn for visor-tracert (24×24, stroke = currentColor).
import type { DeviceType } from "../model/types";

const paths: Record<string, string[]> = {
  // devices
  router: ["M4 13h16v5H4z", "M7 15.5h.01M10 15.5h.01", "M8 13V9.5M16 13V9.5", "M5.5 7.5a9 9 0 0 1 13 0", "M8 9.5a5 5 0 0 1 8 0"],
  switch: ["M3 8h18v8H3z", "M6 11h1.5v2H6zM9.5 11H11v2H9.5zM13 11h1.5v2H13zM16.5 11H18v2h-1.5z"],
  firewall: ["M4 5h16v14H4z", "M4 10h16M4 14.5h16", "M9 5v5M15 10v4.5M9 14.5V19"],
  pc: ["M4 4.5h16v11H4z", "M9 19.5h6M12 15.5v4"],
  laptop: ["M5 6h14v9H5z", "M3 18h18l-1.5-3h-15z"],
  server: ["M5 3.5h14v7H5zM5 13.5h14v7H5z", "M8 7h.01M8 17h.01", "M12 7h4M12 17h4"],
  phone: ["M7.5 3h9v18h-9z", "M11 18h2"],
  ap: ["M5 15h14v4H5z", "M8 17h.01", "M12 15v-3", "M8.5 9.5a5 5 0 0 1 7 0", "M6 7a8.5 8.5 0 0 1 12 0"],
  iot: ["M8 8h8v8H8z", "M10 4v4M14 4v4M10 16v4M14 16v4M4 10h4M4 14h4M16 10h4M16 14h4"],
  cloud: ["M7 18h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z"],
  // tools
  select: ["M5 4l13 7-6 1.5L9 19z"],
  ping: ["M4 7h16v11H4z", "M4 7l8 6 8-6"],
  trash: ["M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"],
  fit: ["M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"],
  zoomIn: ["M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z", "M20 20l-4.7-4.7", "M10.5 7.5v6M7.5 10.5h6"],
  zoomOut: ["M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z", "M20 20l-4.7-4.7", "M7.5 10.5h6"],
  undo: ["M9 14 4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 0 11H11"],
  redo: ["M15 14l5-5-5-5", "M20 9H9.5a5.5 5.5 0 0 0 0 11H13"],
  // simulation
  realtime: ["M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z", "M12 7.5V12l3 2"],
  simulation: ["M12 5.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z", "M12 9.5V13", "M10 2.5h4", "M18 6l1.5-1.5"],
  first: ["M7 5v14", "M18 6l-8 6 8 6z"],
  prev: ["M15 6l-6 6 6 6"],
  play: ["M8 5.5v13l10-6.5z"],
  pause: ["M8 5h3v14H8zM13 5h3v14h-3z"],
  next: ["M9 6l6 6-6 6"],
  last: ["M17 5v14", "M6 6l8 6-8 6z"],
  // misc
  sun: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"],
  moon: ["M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"],
  file: ["M6 3h8l4 4v14H6z", "M14 3v4h4"],
  plus: ["M12 5v14M5 12h14"],
  chevron: ["M6 9l6 6 6-6"],
  log: ["M4 5h16M4 10h16M4 15h10M4 20h7"],
  dock: ["M4 4h16v16H4z", "M4 14h16"],
  undock: ["M4 9V4h16v16h-5", "M3 13h8v8H3z"],
  search: ["M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z", "M20 20l-4.7-4.7"],
  maximize: ["M14 4h6v6", "M20 4l-6.5 6.5", "M10 20H4v-6", "M4 20l6.5-6.5"],
  restore: ["M19 10h-5V5", "M14 10l6-6", "M5 14h5v5", "M10 14l-6 6"],
  close: ["M6 6l12 12M18 6 6 18"],
  copy: ["M8 8h11v12H8z", "M5 16V4h11"],
  upload: ["M12 15V4", "M7.5 8.5 12 4l4.5 4.5", "M4 15v5h16v-5"],
  download: ["M12 4v11", "M7.5 10.5 12 15l4.5-4.5", "M4 15v5h16v-5"],
  logo: ["M5.5 12a2.5 2.5 0 1 0 0 .01", "M18.5 5a2.5 2.5 0 1 0 0 .01", "M18.5 19a2.5 2.5 0 1 0 0 .01", "M8 11l8-5M8 13l8 5"],
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, title }: { name: IconName | DeviceType; size?: number; title?: string }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      {(paths[name] ?? paths.pc).map(d => <path key={d} d={d} />)}
    </svg>
  );
}
