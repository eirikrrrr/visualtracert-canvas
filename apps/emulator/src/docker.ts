// The little of the Docker Engine API the emulator uses, spoken over its
// unix socket with node:http: images, containers (create, start, inspect,
// list, remove) and exec, also interactive (a shell on a terminal, over the
// connection Docker hands over).
import { request } from "node:http";
import type { Duplex } from "node:stream";

const SOCKET = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";

export class DockerError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

interface Reply {
  status: number;
  text: string;
}

function call(method: string, path: string, body?: unknown, timeout = 60_000): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = request({
      socketPath: SOCKET, path, method, timeout,
      headers: data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {},
    }, res => {
      const chunks: Buffer[] = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error(`Docker no respondió a tiempo (${method} ${path}).`)));
    req.on("error", reject);
    if(data) req.write(data);
    req.end();
  });
}

async function json<R>(method: string, path: string, body?: unknown, timeout?: number): Promise<R> {
  const reply = await call(method, path, body, timeout);
  if(reply.status >= 300){
    let message = reply.text;
    try{ message = JSON.parse(reply.text).message ?? message; }catch(_){ /* plain text */ }
    throw new DockerError(reply.status, message.trim());
  }
  return (reply.text ? JSON.parse(reply.text) : null) as R;
}

export interface ContainerSummary {
  Id: string;
  Names: string[];
  State: string;
  Labels: Record<string, string>;
}

export interface ImageSummary {
  Id: string;
  RepoDigests?: string[];
  Architecture: string;
  Variant?: string;
  Os: string;
  Size: number;
  Created: string;
}

/** an interactive exec: what it reads and writes, as raw terminal bytes */
export interface Session {
  exec: string;
  stream: Duplex;
}

export const docker = {
  async ping(): Promise<boolean> {
    try{ return (await call("GET", "/_ping", undefined, 3000)).status === 200; }catch(_){ return false; }
  },

  /** pulls the image unless it is here already */
  async ensureImage(image: string): Promise<void> {
    if((await call("GET", `/images/${encodeURIComponent(image)}/json`)).status === 200) return;
    const [name, tag = "latest"] = image.split(":");
    const reply = await call("POST", `/images/create?fromImage=${encodeURIComponent(name)}&tag=${encodeURIComponent(tag)}`, undefined, 300_000);
    // the pull reports a failure inside its stream of progress lines
    const failed = reply.text.split("\n").map(line => { try{ return JSON.parse(line); }catch(_){ return null; } }).find(line => line?.error);
    if(reply.status >= 300 || failed) throw new DockerError(reply.status, failed?.error ?? reply.text);
  },

  /** an image as Docker has it, or null when it is not pulled */
  async image(ref: string): Promise<ImageSummary | null> {
    const reply = await call("GET", `/images/${encodeURIComponent(ref)}/json`);
    if(reply.status === 404) return null;
    if(reply.status >= 300) throw new DockerError(reply.status, reply.text);
    return JSON.parse(reply.text);
  },

  /** removes an image; Docker refuses while a container uses it */
  async removeImage(ref: string): Promise<void> {
    await json("DELETE", `/images/${encodeURIComponent(ref)}`);
  },

  /** builds an image from a build context (a tar), and says what it printed */
  async build(tag: string, context: Buffer, labels: Record<string, string> = {}): Promise<{ ok: boolean; log: string }> {
    const reply = await new Promise<Reply>((resolve, reject) => {
      const req = request({
        socketPath: SOCKET, method: "POST", timeout: 900_000,
        path: `/build?t=${encodeURIComponent(tag)}&rm=1&forcerm=1&labels=${encodeURIComponent(JSON.stringify(labels))}`,
        headers: { "Content-Type": "application/x-tar", "Content-Length": context.length },
      }, res => {
        const chunks: Buffer[] = [];
        res.on("data", chunk => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      });
      req.on("timeout", () => req.destroy(new Error("Docker no terminó de construir a tiempo.")));
      req.on("error", reject);
      req.end(context);
    });
    // a stream of JSON lines: what each step printed, and the error that stopped it
    const lines = reply.text.split("\n").map(line => { try{ return JSON.parse(line); }catch(_){ return null; } }).filter(Boolean);
    const log = lines.map(line => line.stream ?? (line.error ? `ERROR: ${line.error}\n` : line.status ? `${line.status}\n` : "")).join("");
    return { ok: reply.status < 300 && !lines.some(line => line.error), log: log || reply.text };
  },

  /** the containers with these labels; a label given as null: any value of it */
  async list(labels: Record<string, string | null>): Promise<ContainerSummary[]> {
    const filters = JSON.stringify({ label: Object.entries(labels).map(([key, value]) => value === null ? key : `${key}=${value}`) });
    return json("GET", `/containers/json?all=true&filters=${encodeURIComponent(filters)}`);
  },

  async create(name: string, spec: unknown): Promise<string> {
    return (await json<{ Id: string }>("POST", `/containers/create?name=${encodeURIComponent(name)}`, spec)).Id;
  },

  async start(id: string): Promise<void> {
    await json("POST", `/containers/${id}/start`);
  },

  /** the process id of a running container, as the host sees it */
  async pid(id: string): Promise<number> {
    return (await json<{ State: { Pid: number } }>("GET", `/containers/${id}/json`)).State.Pid;
  },

  /** removes a container, running or not, with its anonymous volumes */
  async remove(id: string): Promise<void> {
    await json("DELETE", `/containers/${id}?force=true&v=true`);
  },

  /** runs a command in a container and returns what it printed and its exit code */
  async exec(id: string, cmd: string[], timeout = 60_000): Promise<{ output: string; exitCode: number }> {
    const created = await json<{ Id: string }>("POST", `/containers/${id}/exec`, { Cmd: cmd, AttachStdout: true, AttachStderr: true, Tty: true });
    // with a terminal, the output comes as plain text (no stream headers)
    const reply = await call("POST", `/exec/${created.Id}/start`, { Detach: false, Tty: true }, timeout);
    const state = await json<{ ExitCode: number }>("GET", `/exec/${created.Id}/json`);
    return { output: reply.text.replace(/\r\n/g, "\n"), exitCode: state.ExitCode };
  },

  /** a command on a terminal, its input and output on the connection that
   * Docker upgrades for it (a terminal sends no stream headers) */
  async shell(id: string, cmd: string[], size: { cols: number; rows: number }): Promise<Session> {
    const created = await json<{ Id: string }>("POST", `/containers/${id}/exec`, {
      Cmd: cmd, AttachStdin: true, AttachStdout: true, AttachStderr: true, Tty: true,
      Env: ["TERM=xterm-256color"], ConsoleSize: [size.rows, size.cols],
    });
    const data = JSON.stringify({ Detach: false, Tty: true, ConsoleSize: [size.rows, size.cols] });
    return new Promise((resolve, reject) => {
      const req = request({
        socketPath: SOCKET, path: `/exec/${created.Id}/start`, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), Connection: "Upgrade", Upgrade: "tcp" },
      });
      req.on("upgrade", (_res, stream, head) => {
        if(head.length) stream.unshift(head);
        resolve({ exec: created.Id, stream });
      });
      // not upgraded: Docker said why
      req.on("response", res => {
        const chunks: Buffer[] = [];
        res.on("data", chunk => chunks.push(chunk));
        res.on("end", () => reject(new DockerError(res.statusCode ?? 0, Buffer.concat(chunks).toString("utf8").trim())));
      });
      req.on("error", reject);
      req.end(data);
    });
  },

  /** a command left running in a container (a service started at boot) */
  async execDetached(id: string, cmd: string[]): Promise<void> {
    const created = await json<{ Id: string }>("POST", `/containers/${id}/exec`, { Cmd: cmd, AttachStdout: false, AttachStderr: false });
    await json("POST", `/exec/${created.Id}/start`, { Detach: true });
  },

  async resize(exec: string, size: { cols: number; rows: number }): Promise<void> {
    await call("POST", `/exec/${exec}/resize?h=${size.rows}&w=${size.cols}`);
  },

  /** whether an exec still runs, and its process as the host sees it */
  async execState(exec: string): Promise<{ Running: boolean; Pid: number }> {
    return json("GET", `/exec/${exec}/json`);
  },
};
