// Line icons drawn for visual-tracert (24×24, stroke = currentColor), and the
// official logos of the images devices can be (in their own colours).
import type { DeviceType } from "@visual-tracert/model";
import type { JSX } from "react";

// The Alpine Linux mark, from its official logo
// (https://alpinelinux.org/alpinelinux-logo.svg): the hexagon and its
// mountains, drawn over a white hexagon so they read on any theme.
const ALPINE_HEXAGON = "M 57.588,80.32 94.807,15.838 57.588,-48.644 l -74.463,0 -37.219,64.482 37.219,64.482 74.463,0 z";
const ALPINE_MARK = "M 0,0 0,15.687 -11.296,4.379 C -10.079,3.532 -8.932,2.836 -7.853,2.27 -6.774,1.703 -5.764,1.265 -4.823,0.932 -3.882,0.598 -3.009,0.37 -2.206,0.222 -1.402,0.075 -0.667,0.009 0,0 m 57.751,1.304 c 0.02,-0.017 0.13,-0.11 0.333,-0.239 0.204,-0.13 0.502,-0.297 0.898,-0.462 0.395,-0.164 0.889,-0.327 1.485,-0.448 0.596,-0.122 1.294,-0.202 2.098,-0.202 0.671,0 1.411,0.059 2.222,0.2 0.812,0.142 1.693,0.367 2.645,0.699 0.953,0.333 1.976,0.773 3.07,1.344 1.094,0.572 2.259,1.276 3.495,2.136 L 65.425,12.729 37.015,41.245 24.549,28.776 7.733,46.117 -34.471,4.39 c 1.235,-0.86 2.398,-1.564 3.491,-2.136 1.093,-0.571 2.115,-1.011 3.067,-1.344 0.951,-0.332 1.832,-0.557 2.643,-0.698 0.81,-0.142 1.55,-0.201 2.22,-0.201 0.804,0 1.502,0.08 2.097,0.202 0.596,0.121 1.089,0.284 1.485,0.449 0.396,0.164 0.693,0.331 0.897,0.461 0.204,0.13 0.314,0.223 0.334,0.24 L 0.815,20.415 7.628,26.948 26.494,8.082 33.085,1.304 c 0.02,-0.017 0.13,-0.11 0.334,-0.239 0.204,-0.13 0.501,-0.297 0.897,-0.462 0.396,-0.164 0.89,-0.327 1.485,-0.448 0.596,-0.122 1.295,-0.202 2.099,-0.202 0.67,0 1.411,0.059 2.222,0.2 0.811,0.142 1.693,0.367 2.645,0.699 0.952,0.333 1.975,0.773 3.069,1.344 1.094,0.572 2.259,1.276 3.495,2.136 L 34.192,19.157 37.01,21.975 50.111,8.874 57.751,1.304 M 57.588,80.32 94.807,15.838 57.588,-48.644 l -74.463,0 -37.219,64.482 37.219,64.482 74.463,0 z";
const ALPINE_DOT = "M 0,0 -9.913,9.895 -9.208,10.604 0.775,0.73 0,0 z";

function AlpineLogo({ size }: { size: number }) {
  return (
    <svg className="icon brand" width={size} height={size} viewBox="-56 -50 152.8 132" aria-hidden="true">
      <g transform="matrix(1 0 0 -1 0 31.676)">
        <path d={ALPINE_HEXAGON} fill="#fff" />
        <path d={ALPINE_MARK} fill="#0d597f" />
        <path d={ALPINE_DOT} fill="#0d597f" transform="translate(34.3647 18.9792)" />
      </g>
    </svg>
  );
}

/** device types drawn with an official logo instead of a line icon */
const BRANDS: Partial<Record<string, (props: { size: number }) => JSX.Element>> = { alpine: AlpineLogo };

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
  emulation: ["M4 5h16v14H4z", "M7.5 9.5l3 2.5-3 2.5", "M12.5 15h4"],
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
  topology: ["M3.5 4.5h17v15h-17z", "M3.5 8.5h17", "M8 12.5h3v3H8zM14 12.5h3v3h-3z", "M11 14h3"],
  globe: ["M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z", "M3.5 12h17", "M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5s1.1-6.1 3.4-8.5z"],
  copy: ["M8 8h11v12H8z", "M5 16V4h11"],
  upload: ["M12 15V4", "M7.5 8.5 12 4l4.5 4.5", "M4 15v5h16v-5"],
  download: ["M12 4v11", "M7.5 10.5 12 15l4.5-4.5", "M4 15v5h16v-5"],
  logo: ["M5.5 12a2.5 2.5 0 1 0 0 .01", "M18.5 5a2.5 2.5 0 1 0 0 .01", "M18.5 19a2.5 2.5 0 1 0 0 .01", "M8 11l8-5M8 13l8 5"],
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, title }: { name: IconName | DeviceType; size?: number; title?: string }) {
  const Brand = BRANDS[name];
  if(Brand) return <Brand size={size} />;
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      {(paths[name] ?? paths.pc).map(d => <path key={d} d={d} />)}
    </svg>
  );
}
