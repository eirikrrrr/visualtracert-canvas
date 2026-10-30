// The emulator's API (apps/emulator), at /api through the web's nginx (or
// Vite's proxy in development). It answers in the interface language.
import { serialize, type ImageId, type ImageInfo, type Topology } from "@visual-tracert/model";
import { t, useLang } from "../i18n";

export interface DeviceState {
  device: string;
  container: string;
  state: string;
}

export interface LabState {
  lab: string;
  deployed: boolean;
  fingerprint: string | null;
  devices: DeviceState[];
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
  imageId?: string;
  digest?: string | null;
  architecture?: string;
  os?: string;
  size?: number;
  created?: string;
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
  if(!res.ok) throw new Error(data?.error ?? t("El emulador no está disponible ({status}).", { status: res.status }));
  return data as R;
}

const labPath = (lab: string) => `/labs/${encodeURIComponent(lab)}`;

export const emulator = {
  status: (lab: string) => call<LabState>("GET", labPath(lab)),
  /** the topology goes as the editor's JSON document */
  deploy: (lab: string, topology: Topology) => call<LabState & { warnings: string[] }>("PUT", labPath(lab), serialize(topology, "json")),
  stop: (lab: string) => call<LabState>("DELETE", labPath(lab)),
  run: (lab: string, device: string, command: Command, target?: string) =>
    call<CommandResult>("POST", `${labPath(lab)}/run`, JSON.stringify({ device, command, target })),
  image: (id: ImageId) => call<ImageStatus>("GET", `/images/${encodeURIComponent(id)}`),
  /** the WebSocket of a device's CLI (see apps/emulator/src/server.ts) */
  shellUrl: (lab: string, device: string, size: { cols: number; rows: number }) => {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const query = new URLSearchParams({ cols: String(size.cols), rows: String(size.rows), lang: useLang.getState().lang });
    return `${scheme}://${location.host}/api${labPath(lab)}/devices/${encodeURIComponent(device)}/shell?${query}`;
  },
};
