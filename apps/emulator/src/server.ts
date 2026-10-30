// The emulator's HTTP API, behind the web's nginx at /api:
//   GET    /api/health              is it up, and can it reach Docker
//   GET    /api/labs/:lab           what of the lab is running
//   PUT    /api/labs/:lab           deploy it: the topology document (JSON)
//   DELETE /api/labs/:lab           remove it
//   POST   /api/labs/:lab/run       { device, command, target? } on a device
//   GET    /api/images/:image       an image: what it is, and what Docker has of it
//   WS     /api/labs/:lab/devices/:device/shell?cols=&rows=
//          the device's CLI: binary frames are what the terminal reads and
//          writes; text frames are {"type":"resize",cols,rows} from the page
//          and {"type":"error",message} to it
// Messages come in the language the request asks for (Accept-Language, or
// ?lang= on the WebSocket). The topology comes as the editor's JSON document
// and is checked by the same parser as the editor.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { IMAGES, parse, translator, type ImageId, type Lang, type T } from "@visual-tracert/model";
import { version } from "../../../package.json";
import { docker } from "./docker";
import { COMMANDS, deploy, destroy, execute, imageStatus, openShell, status, type Command, type Size } from "./lab";

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
    send(res, 200, { ok: true, version, docker: await docker.ping() });
    return;
  }

  const image = url.pathname.match(/^\/api\/images\/([^/]+)$/);
  if(image && method === "GET"){
    const info = IMAGES[decodeURIComponent(image[1]) as ImageId];
    if(!info || !Object.hasOwn(IMAGES, image[1])) throw new HttpError(404, t("No existe esa imagen."));
    send(res, 200, await imageStatus(info));
    return;
  }

  const match = url.pathname.match(/^\/api\/labs\/([^/]+)(\/run)?$/);
  if(!match) throw new HttpError(404, t("No existe esa ruta del emulador."));
  const lab = decodeURIComponent(match[1]);
  if(!LAB_ID.test(lab)) throw new HttpError(400, t("El identificador del laboratorio no es válido."));

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

const SHELL = /^\/api\/labs\/([^/]+)\/devices\/([^/]+)\/shell$/;
const sizeOf = (cols: unknown, rows: unknown): Size => ({
  cols: Math.min(Math.max(Math.round(Number(cols)) || 80, 20), 400),
  rows: Math.min(Math.max(Math.round(Number(rows)) || 24, 5), 200),
});

/** a page's terminal joined to a shell on the device, until either ends */
async function attachShell(socket: WebSocket, lab: string, device: string, size: Size, t: T) {
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
    session = await openShell(lab, device, size, t);
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
    shells.handleUpgrade(req, socket, head, ws => { void attachShell(ws, lab, device, size, t); });
  });
  server.listen(port, () => console.log(`visual-tracert emulator ${version} on :${port}`));
  return server;
}
