// The emulator's API (apps/emulator), at /api through the web's nginx (or
// Vite's proxy in development). It answers in the interface language.
import { serialize, type ImageId, type ImageInfo, type ImageProfile, type Topology } from "@visual-tracert/model";
import { AuthError, useAuth } from "../app/auth";
import { t, useLang } from "../i18n";

export interface DeviceState {
  device: string;
  container: string;
  state: string;
  /** it runs an older build of its image: deploying again updates it */
  outdated?: boolean;
}

export interface LabState {
  lab: string;
  deployed: boolean;
  fingerprint: string | null;
  devices: DeviceState[];
}

export interface Health {
  ok: boolean;
  version: string;
  docker: boolean;
  kvm?: boolean;
  privileged?: boolean;
}

export type Command = "ping" | "traceroute" | "addresses" | "routes" | "neighbours";

export interface CommandResult {
  command: string;
  output: string;
  exitCode: number;
}

/** an image as the emulator describes it, with what Docker has of it once pulled */
export interface ImageStatus extends ImageInfo {
  pulled: boolean;
  /** false: it needs a privileged container and this server does not allow it */
  allowed: boolean;
  imageId?: string;
  digest?: string | null;
  architecture?: string;
  os?: string;
  size?: number;
  created?: string;
}

export type ProfileState = "built" | "outdated" | "missing";

export interface ProfileStatus {
  profile: ImageProfile;
  state: ProfileState;
  size?: number;
}

/** a profile as it is edited: its lists as text, one per line */
export interface ProfileDraft {
  name: string;
  base: ImageId;
  description?: string;
  packages: string;
  setup: string;
  startup: string;
}

async function call<R>(method: string, path: string, body?: string): Promise<R> {
  let res: Response;
  try{
    res = await fetch(`/api${path}`, {
      method, body,
      headers: { "Accept-Language": useLang.getState().lang, ...(body ? { "Content-Type": "application/json" } : {}) },
    });
  }catch(_){
    throw new Error(t("No se puede conectar con el emulador."));
  }
  const data = await res.json().catch(() => null);
  // the session ended (nginx asks the accounts service first): back to the sign-in
  if(res.status === 401){ useAuth.getState().expired(); throw new AuthError("unauthorized"); }
  if(res.status === 403 && data?.error === "forbidden") throw new Error(t("Solo un administrador puede cambiar las imágenes y perfiles del servidor."));
  if(!res.ok) throw new Error(data?.error ?? t("El emulador no está disponible ({status}).", { status: res.status }));
  return data as R;
}

const labPath = (lab: string) => `/labs/${encodeURIComponent(lab)}`;

export const emulator = {
  status: (lab: string) => call<LabState>("GET", labPath(lab)),
  /** the labs with containers on this server, with how many run */
  labs: () => call<{ lab: string; containers: number; running: number }[]>("GET", "/labs"),
  /** the topology goes as the editor's JSON document; with expires (ms since
   * the epoch), the emulator stops it by itself then */
  deploy: (lab: string, topology: Topology, expires?: number) =>
    call<LabState & { warnings: string[] }>("PUT", `${labPath(lab)}${expires ? `?expires=${expires}` : ""}`, serialize(topology, "json")),
  stop: (lab: string) => call<LabState>("DELETE", labPath(lab)),
  /** some devices started (those stopped) or again (their containers and
   * cables), or stopped; the rest left running */
  start: (lab: string, topology: Topology, devices: string[]) =>
    call<LabState & { warnings: string[] }>("POST", `${labPath(lab)}/start`, JSON.stringify({ devices, document: JSON.parse(serialize(topology, "json")) })),
  restart: (lab: string, topology: Topology, devices: string[]) =>
    call<LabState & { warnings: string[] }>("POST", `${labPath(lab)}/restart`, JSON.stringify({ devices, document: JSON.parse(serialize(topology, "json")) })),
  /** the addresses the running devices have now (their CLI may have changed them), by device */
  addresses: (lab: string) => call<Record<string, { ifname: string; address: string }[]>>("GET", `${labPath(lab)}/addresses`),
  stopDevices: (lab: string, devices: string[]) => call<LabState>("POST", `${labPath(lab)}/stop`, JSON.stringify({ devices })),
  /** the emulator: its version, Docker, KVM, privileged containers */
  health: () => call<Health>("GET", "/health"),
  run: (lab: string, device: string, command: Command, target?: string) =>
    call<CommandResult>("POST", `${labPath(lab)}/run`, JSON.stringify({ device, command, target })),
  image: (id: ImageId) => call<ImageStatus>("GET", `/images/${encodeURIComponent(id)}`),
  images: () => call<ImageStatus[]>("GET", "/images"),
  pull: (id: ImageId) => call<ImageStatus>("POST", `/images/${encodeURIComponent(id)}/pull`),
  removeImage: (id: ImageId) => call<ImageStatus>("DELETE", `/images/${encodeURIComponent(id)}`),
  profiles: () => call<ProfileStatus[]>("GET", "/profiles"),
  saveProfile: (id: string, draft: ProfileDraft) => call<ProfileStatus>("PUT", `/profiles/${encodeURIComponent(id)}`, JSON.stringify(draft)),
  buildProfile: (id: string) => call<ProfileStatus & { ok: boolean; log: string }>("POST", `/profiles/${encodeURIComponent(id)}/build`),
  removeProfile: (id: string) => call<{ removed: string }>("DELETE", `/profiles/${encodeURIComponent(id)}`),
  /** the WebSocket of a traffic capture on a device's port ("any": all) */
  captureUrl: (lab: string, device: string, iface: string, filter: string) => {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const query = new URLSearchParams({ iface, filter, lang: useLang.getState().lang });
    return `${scheme}://${location.host}/api${labPath(lab)}/devices/${encodeURIComponent(device)}/capture?${query}`;
  },
  /** the WebSocket of a device's CLI (see apps/emulator/src/server.ts) */
  shellUrl: (lab: string, device: string, size: { cols: number; rows: number }, shell?: string) => {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const query = new URLSearchParams({ cols: String(size.cols), rows: String(size.rows), lang: useLang.getState().lang, ...(shell ? { shell } : {}) });
    return `${scheme}://${location.host}/api${labPath(lab)}/devices/${encodeURIComponent(device)}/shell?${query}`;
  },
};
