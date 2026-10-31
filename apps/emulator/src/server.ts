// The emulator's HTTP API, behind the web's nginx at /api:
//   GET    /api/health              is it up, can it reach Docker, has it KVM, are privileged containers allowed
//   GET    /api/labs/:lab           what of the lab is running
//   PUT    /api/labs/:lab           deploy it: the topology document (JSON)
//   DELETE /api/labs/:lab           remove it
//   POST   /api/labs/:lab/run       { device, command, target? } on a device
//   POST   /api/labs/:lab/start     { devices, document }: those devices, if stopped; the rest left running
//   POST   /api/labs/:lab/restart   { devices, document }: those devices again
//   POST   /api/labs/:lab/stop      { devices }: those devices stopped
//   GET    /api/images              every image of the catalog, and what Docker has of each
//   GET    /api/images/:image       one of them
//   POST   /api/images/:image/pull  download it (Marketplace); build it, a virtual machine
//   DELETE /api/images/:image       remove it from this server
//   GET    /api/profiles            the image profiles, each with its state
//   PUT    /api/profiles/:id        save one (checked as the model says)
//   POST   /api/profiles/:id/build  build its image: { ok, log, state }
//   DELETE /api/profiles/:id        remove it, and its image
//   WS     /api/labs/:lab/devices/:device/shell?cols=&rows=&shell=
//          the device's CLI: binary frames are what the terminal reads and
//          writes; text frames are {"type":"resize",cols,rows} from the page
//          and {"type":"error",message} to it
//   WS     /api/labs/:lab/devices/:device/capture?iface=&filter=
//          a traffic capture on a port ("any": all): binary frames are pcap
//          (its header first); text frames {"type":"status"|"error",message}
// Messages come in the language the request asks for (Accept-Language, or
// ?lang= on the WebSocket). The topology comes as the editor's JSON document
// and is checked by the same parser as the editor.
import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { checkProfile, IMAGES, parse, PROFILE_ID, translator, type ImageId, type Lang, type T } from "@visual-tracert/model";
import { version } from "../../../package.json";
import { CAPTURE_LIMIT, CaptureError, startCapture } from "./capture";
import { docker, DockerError } from "./docker";
import { buildProfile, loadProfiles, profileStatus, removeProfile, saveProfile } from "./profiles";
import { ALLOW_PRIVILEGED, COMMANDS, deploy, destroy, execute, imageStatus, openShell, relaunch, status, stopDevices, type Command, type Size } from "./lab";
import { ensureImage } from "./vrnetlab";

const MAX_BODY = 2 * 1024 * 1024;
const LAB_ID = /^[A-Za-z0-9_-]{1,64}$/;

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function langOf(req: IncomingMessage, url?: URL): Lang {
  const asked = (url?.searchParams.get("lang") ?? req.headers["accept-language"] ?? "").slice(0, 2).toLowerCase();
  return asked === "en" || asked === "pt" ? asked : "es";
}

function bodyOf(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if(size > MAX_BODY){ reject(new HttpError(413, "Too large")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try{ resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch(_){ reject(new HttpError(400, "JSON")); }
    });
    req.on("error", reject);
  });
}

function send(res: ServerResponse, code: number, data: unknown) {
  const text = JSON.stringify(data);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(text);
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const t = translator(langOf(req));
  const url = new URL(req.url ?? "/", "http://emulator");
  const method = req.method ?? "GET";

  if(url.pathname === "/api/health" && method === "GET"){
    // and what it can run: virtual machines at full speed (KVM), privileged containers
    send(res, 200, { ok: true, version, docker: await docker.ping(), kvm: existsSync("/dev/kvm"), privileged: ALLOW_PRIVILEGED });
    return;
  }

  // the catalog of images: what is downloaded, the Marketplace's downloads
  if(url.pathname === "/api/images" && method === "GET"){
    send(res, 200, await Promise.all(Object.values(IMAGES).map(imageStatus)));
    return;
  }
  const image = url.pathname.match(/^\/api\/images\/([^/]+)(\/pull)?$/);
  if(image){
    const id = decodeURIComponent(image[1]);
    if(!Object.hasOwn(IMAGES, id)) throw new HttpError(404, t("No existe esa imagen."));
    const info = IMAGES[id as ImageId];
    if(image[2]){
      if(method !== "POST") throw new HttpError(405, "POST");
      await ensureImage(info.ref);
    }else if(method === "DELETE"){
      if(info.builtin) throw new HttpError(400, t("{image} viene con la app: no se puede quitar.", { image: info.name }));
      try{
        await docker.removeImage(info.ref);
      }catch(error){
        if(error instanceof DockerError && error.status === 409) throw new HttpError(409, t("{image} está en uso: detén los laboratorios que la usan.", { image: info.name }));
        if(!(error instanceof DockerError && error.status === 404)) throw error;
      }
    }else if(method !== "GET") throw new HttpError(405, method);
    send(res, 200, await imageStatus(info));
    return;
  }

  // the image profiles
  if(url.pathname === "/api/profiles" && method === "GET"){
    send(res, 200, await Promise.all((await loadProfiles()).map(profileStatus)));
    return;
  }
  const profile = url.pathname.match(/^\/api\/profiles\/([^/]+)(\/build)?$/);
  if(profile){
    const id = decodeURIComponent(profile[1]);
    if(!PROFILE_ID.test(id)) throw new HttpError(400, t("El id del perfil va en minúsculas, números y guiones (hasta 40)."));
    const saved = async () => (await loadProfiles()).find(item => item.id === id);
    if(profile[2]){
      if(method !== "POST") throw new HttpError(405, "POST");
      const current = await saved();
      if(!current) throw new HttpError(404, t("No existe ese perfil."));
      const built = await buildProfile(current);
      send(res, 200, { ...built, ...(await profileStatus(current)) });
      return;
    }
    if(method === "PUT"){
      const checked = checkProfile({ ...(await bodyOf(req) as object), id }, t);
      if(!checked.profile) throw new HttpError(400, checked.problems.join(" "));
      await saveProfile(checked.profile);
      send(res, 200, await profileStatus(checked.profile));
      return;
    }
    if(method === "DELETE"){
      await removeProfile(id);
      send(res, 200, { removed: id });
      return;
    }
    throw new HttpError(405, method);
  }

  const match = url.pathname.match(/^\/api\/labs\/([^/]+)(\/run|\/start|\/restart|\/stop)?$/);
  if(!match) throw new HttpError(404, t("No existe esa ruta del emulador."));
  const lab = decodeURIComponent(match[1]);
  if(!LAB_ID.test(lab)) throw new HttpError(400, t("El identificador del laboratorio no es válido."));

  if(match[2] === "/start" || match[2] === "/restart" || match[2] === "/stop"){
    if(method !== "POST") throw new HttpError(405, "POST");
    const body = (await bodyOf(req)) as { devices?: unknown; document?: unknown };
    if(!Array.isArray(body.devices) || !body.devices.length || !body.devices.every(item => typeof item === "string")) throw new HttpError(400, t("Falta qué equipos."));
    const devices = body.devices as string[];
    if(match[2] === "/stop"){ send(res, 200, await stopDevices(lab, devices)); return; }
    const parsed = parse(JSON.stringify(body.document ?? {}), "json", t);
    if(!parsed.topology) throw new HttpError(400, parsed.problems.map(problem => problem.message).join(" "));
    send(res, 200, await relaunch(lab, parsed.topology, devices, match[2] === "/restart", t));
    return;
  }
  if(match[2]){
    if(method !== "POST") throw new HttpError(405, "POST");
    const body = (await bodyOf(req)) as { device?: unknown; command?: unknown; target?: unknown };
    if(typeof body.device !== "string" || !COMMANDS.includes(body.command as Command)) throw new HttpError(400, t("Falta el equipo o el comando no existe."));
    const target = typeof body.target === "string" ? body.target.trim() : undefined;
    send(res, 200, await execute(lab, body.device, body.command as Command, target, t));
    return;
  }
  if(method === "GET"){ send(res, 200, await status(lab)); return; }
  if(method === "DELETE"){ send(res, 200, await destroy(lab)); return; }
  if(method === "PUT"){
    const parsed = parse(JSON.stringify(await bodyOf(req)), "json", t);
    if(!parsed.topology) throw new HttpError(400, parsed.problems.map(problem => problem.message).join(" "));
    send(res, 200, await deploy(lab, parsed.topology, t));
    return;
  }
  throw new HttpError(405, method);
}

const SHELL = /^\/api\/labs\/([^/]+)\/devices\/([^/]+)\/(shell|capture)$/;
const sizeOf = (cols: unknown, rows: unknown): Size => ({
  cols: Math.min(Math.max(Math.round(Number(cols)) || 80, 20), 400),
  rows: Math.min(Math.max(Math.round(Number(rows)) || 24, 5), 200),
});

/** a page's terminal joined to a shell on the device, until either ends */
async function attachShell(socket: WebSocket, lab: string, device: string, size: Size, shell: string | undefined, t: T) {
  const fail = (message: string) => {
    socket.send(JSON.stringify({ type: "error", message }));
    socket.close(1011);
  };
  // what the page sends while the shell opens waits for it
  const early: [Buffer, boolean][] = [];
  let handle = (data: Buffer, binary: boolean) => { early.push([data, binary]); };
  socket.on("message", (data, binary) => handle(data as Buffer, binary));
  let session;
  try{
    session = await openShell(lab, device, size, shell, t);
  }catch(error){
    fail((error as Error).message);
    return;
  }
  const { exec, stream } = session;
  // the page went away: the shell goes too, not left waiting on its terminal
  const end = () => {
    stream.end();
    docker.execState(exec).then(state => { if(state.Running && state.Pid) process.kill(state.Pid, "SIGHUP"); }).catch(() => undefined);
  };
  if(socket.readyState !== socket.OPEN){ end(); return; }
  stream.on("data", (chunk: Buffer) => { if(socket.readyState === socket.OPEN) socket.send(chunk); });
  stream.on("end", () => socket.close(1000));
  stream.on("error", () => socket.close(1011));
  handle = (data, binary) => {
    if(binary){ stream.write(data); return; }
    try{
      const message = JSON.parse(String(data));
      if(message.type === "resize") docker.resize(exec, sizeOf(message.cols, message.rows)).catch(() => undefined);
    }catch(_){ /* not ours */ }
  };
  for(const [data, binary] of early.splice(0)) handle(data, binary);
  socket.on("close", end);
}

/** a capture streamed to the page, until it closes it (or the limit) */
async function attachCapture(socket: WebSocket, lab: string, device: string, iface: string, filter: string, t: T) {
  const say = (type: "status" | "error", message: string) => { if(socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type, message })); };
  let tcpdump;
  try{
    tcpdump = await startCapture(lab, device, iface, filter, t);
  }catch(error){
    say("error", error instanceof CaptureError ? error.message : (error as Error).message);
    socket.close(1011);
    return;
  }
  let sent = 0;
  tcpdump.stdout.on("data", (chunk: Buffer) => {
    if(socket.readyState !== socket.OPEN) return;
    socket.send(chunk);
    sent += chunk.length;
    if(sent > CAPTURE_LIMIT){ say("status", t("Captura detenida: llegó al límite de {mb} MB.", { mb: CAPTURE_LIMIT / 1024 / 1024 })); tcpdump.kill("SIGTERM"); }
  });
  // what tcpdump says ("listening on…", or why it could not)
  tcpdump.stderr.on("data", (chunk: Buffer) => {
    for(const line of chunk.toString("utf8").split("\n").map(item => item.trim()).filter(Boolean)){
      say(/^tcpdump: (listening|verbose)/.test(line) || /packets? (captured|received|dropped)/.test(line) ? "status" : "error", line.replace(/^tcpdump: /, ""));
    }
  });
  tcpdump.on("close", () => socket.close(1000));
  tcpdump.on("error", error => { say("error", error.message); socket.close(1011); });
  socket.on("close", () => { if(tcpdump.exitCode === null) tcpdump.kill("SIGTERM"); });
}

function refuse(socket: Duplex, status: number, text: string) {
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

export function startServer(port: number) {
  const server = createServer((req, res) => {
    route(req, res).catch(error => {
      const code = error instanceof HttpError ? error.status : 500;
      if(code === 500) console.error(error);
      send(res, code, { error: (error as Error).message });
    });
  });
  const shells = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://emulator");
    const match = url.pathname.match(SHELL);
    if(!match){ refuse(socket, 404, "Not Found"); return; }
    const lab = decodeURIComponent(match[1]), device = decodeURIComponent(match[2]);
    if(!LAB_ID.test(lab) || !device || device.length > 128){ refuse(socket, 400, "Bad Request"); return; }
    const t = translator(langOf(req, url));
    const size = sizeOf(url.searchParams.get("cols"), url.searchParams.get("rows"));
    if(match[3] === "capture"){
      const iface = (url.searchParams.get("iface") ?? "any").slice(0, 64);
      const filter = url.searchParams.get("filter") ?? "";
      shells.handleUpgrade(req, socket, head, ws => { void attachCapture(ws, lab, device, iface, filter, t); });
      return;
    }
    const shell = url.searchParams.get("shell") ?? undefined;
    shells.handleUpgrade(req, socket, head, ws => { void attachShell(ws, lab, device, size, shell, t); });
  });
  server.listen(port, () => console.log(`visual-tracert emulator ${version} on :${port}`));
  return server;
}
