// A lab running for real: its plan executed (containers started, veth
// pairs moved into their namespaces, each device configured), its state read
// back from Docker, and the few commands a user can run on its devices. The
// containers carry the lab's labels, so the state survives a restart of the
// emulator and a lab can always be cleaned up.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isIp, spanish, type ImageInfo, type T, type Topology } from "@visual-tracert/model";
import { docker, type ContainerSummary } from "./docker";
import { LABELS, planLab } from "./plan";

const run = promisify(execFile);
/** a host command (ip, nsenter): its error says what failed */
async function host(args: string[]): Promise<void> {
  try{
    await run(args[0], args.slice(1), { timeout: 30_000 });
  }catch(error){
    const detail = (error as { stderr?: string }).stderr?.trim() || (error as Error).message;
    throw new Error(`${args.slice(0, 4).join(" ")}: ${detail}`);
  }
}

/** a device's container: small, without a network, stopped at once; it may
 * change its own network (NET_ADMIN, in its namespace only) from its CLI */
const MEMORY = 96 * 1024 * 1024;

// one change of a lab at a time
const queues = new Map<string, Promise<unknown>>();
function serial<R>(lab: string, task: () => Promise<R>): Promise<R> {
  const next = (queues.get(lab) ?? Promise.resolve()).catch(() => undefined).then(task);
  queues.set(lab, next);
  return next;
}

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

const containersOf = (lab: string) => docker.list({ [LABELS.lab]: lab });

function stateOf(lab: string, containers: ContainerSummary[]): LabState {
  return {
    lab,
    deployed: containers.length > 0,
    fingerprint: containers[0]?.Labels[LABELS.fingerprint] ?? null,
    devices: containers.map(container => ({
      device: container.Labels[LABELS.device],
      container: container.Names[0]?.replace(/^\//, "") ?? container.Id.slice(0, 12),
      state: container.State,
    })).sort((p, q) => p.device.localeCompare(q.device)),
  };
}

export async function status(lab: string): Promise<LabState> {
  return stateOf(lab, await containersOf(lab));
}

async function removeAll(lab: string): Promise<void> {
  await Promise.all((await containersOf(lab)).map(container => docker.remove(container.Id)));
}

export function destroy(lab: string): Promise<LabState> {
  return serial(lab, async () => {
    await removeAll(lab);
    return status(lab);
  });
}

/** builds the lab from its topology, after removing what was running */
export function deploy(lab: string, topology: Topology, t: T = spanish): Promise<LabState & { warnings: string[] }> {
  return serial(lab, async () => {
    const plan = planLab(lab, topology, t);
    await removeAll(lab);
    for(const image of new Set(plan.nodes.map(node => node.image))) await docker.ensureImage(image);
    const pids = new Map<string, number>();
    try{
      await Promise.all(plan.nodes.map(async node => {
        const id = await docker.create(node.container, {
          Image: node.image,
          Cmd: ["sleep", "2147483647"],
          Hostname: node.hostname,
          Labels: { [LABELS.lab]: lab, [LABELS.device]: node.device, [LABELS.fingerprint]: plan.fingerprint },
          HostConfig: { NetworkMode: "none", Init: true, Memory: MEMORY, CapAdd: ["NET_ADMIN"] },
        });
        await docker.start(id);
        pids.set(node.device, await docker.pid(id));
      }));
      // the cables: a veth pair here, each end moved into its device
      for(const link of plan.links){
        await host(["ip", "link", "add", link.a.temp, "type", "veth", "peer", "name", link.b.temp]);
        await host(["ip", "link", "set", link.a.temp, "netns", String(pids.get(link.a.device))]);
        await host(["ip", "link", "set", link.b.temp, "netns", String(pids.get(link.b.device))]);
      }
      await Promise.all(plan.nodes.map(node =>
        host(["nsenter", "-t", String(pids.get(node.device)), "-n", "sh", "-ec", node.script.join("\n")])));
    }catch(error){
      // whatever was half built goes: the ends still here, and the containers
      await Promise.all(plan.links.map(link => host(["ip", "link", "del", link.a.temp]).catch(() => undefined)));
      await removeAll(lab).catch(() => undefined);
      throw new Error(t("No se pudo desplegar el laboratorio: {error}", { error: (error as Error).message }));
    }
    return { ...(await status(lab)), warnings: plan.warnings };
  });
}

/** the commands a device can run: nothing else reaches its shell */
export type Command = "ping" | "traceroute" | "addresses" | "routes" | "neighbours";
export const COMMANDS: Command[] = ["ping", "traceroute", "addresses", "routes", "neighbours"];

const HOSTNAME = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

export function argvOf(command: Command, target: string | undefined): string[] | null {
  const needsTarget = command === "ping" || command === "traceroute";
  if(needsTarget && !(target && (isIp(target) || HOSTNAME.test(target)))) return null;
  switch(command){
    case "ping": return ["ping", "-c", "4", "-W", "2", target!];
    case "traceroute": return ["traceroute", "-n", "-w", "1", "-q", "1", "-m", "15", target!];
    case "addresses": return ["ip", "addr"];
    case "routes": return ["ip", "route"];
    case "neighbours": return ["ip", "neigh"];
  }
}

async function containerOf(lab: string, device: string, t: T) {
  const container = (await docker.list({ [LABELS.lab]: lab, [LABELS.device]: device }))[0];
  if(!container) throw new Error(t("{device} no está desplegado.", { device }));
  if(container.State !== "running") throw new Error(t("{device} no está en marcha.", { device }));
  return container;
}

export async function execute(lab: string, device: string, command: Command, target: string | undefined, t: T = spanish) {
  const argv = argvOf(command, target);
  if(!argv) throw new Error(t("Escribe un destino válido: una IP o un nombre."));
  const container = await containerOf(lab, device, t);
  return { command: argv.join(" "), ...(await docker.exec(container.Id, argv)) };
}

/** the terminal size a shell starts with, and is changed to */
export interface Size {
  cols: number;
  rows: number;
}

/** an interactive shell on a device: its login shell, on a terminal */
export async function openShell(lab: string, device: string, size: Size, t: T = spanish) {
  const container = await containerOf(lab, device, t);
  return docker.shell(container.Id, ["/bin/sh", "-l"], size);
}

/** what Docker has of an image: none until a lab first pulls it */
export async function imageStatus(info: ImageInfo) {
  const image = await docker.image(info.ref);
  return {
    ...info,
    pulled: Boolean(image),
    ...(image ? {
      imageId: image.Id,
      digest: image.RepoDigests?.[0]?.split("@")[1] ?? null,
      architecture: [image.Architecture, image.Variant].filter(Boolean).join("/"),
      os: image.Os,
      size: image.Size,
      created: image.Created,
    } : {}),
  };
}
