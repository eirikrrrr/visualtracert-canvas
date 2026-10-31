// A lab running for real: its plan executed (containers started, veth
// pairs moved into their namespaces, each device configured), its state read
// back from Docker, and the few commands a user can run on its devices. The
// containers carry the lab's labels, so the state survives a restart of the
// emulator and a lab can always be cleaned up.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { IMAGES, isIp, spanish, type ImageId, type ImageInfo, type T, type Topology } from "@visual-tracert/model";
import { docker, type ContainerSummary } from "./docker";
import { LABELS, planLab, type ProfileCatalog } from "./plan";
import { loadProfiles, profileStatus } from "./profiles";
import { ensureImage, vmDevices } from "./vrnetlab";

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

// a device's container: small, without a network, stopped at once; it may
// change its own network (NET_ADMIN, in its namespace only) from its CLI
const MB = 1024 * 1024;

/** whether images that need a privileged container (SR Linux) may run: off
 * unless the server says so, since a privileged container is root here */
export const ALLOW_PRIVILEGED = /^(1|true|yes|on)$/i.test(process.env.ALLOW_PRIVILEGED ?? "");

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
    const profiles: ProfileCatalog = new Map(await Promise.all((await loadProfiles()).map(async profile =>
      [profile.id, { profile, ready: (await profileStatus(profile)).state === "built" }] as const)));
    const plan = planLab(lab, topology, t, profiles, { allowPrivileged: ALLOW_PRIVILEGED });
    await removeAll(lab);
    for(const image of new Set(plan.nodes.map(node => node.image))) await ensureImage(image);
    const pids = new Map<string, number>();
    try{
      await Promise.all(plan.nodes.map(async node => {
        const id = await docker.create(node.container, {
          Image: node.image,
          // a shell kept alive; or what the image runs (a server, a router's
          // daemons, a virtual machine's launcher)
          ...(node.run === "sleep" ? { Entrypoint: ["sleep"], Cmd: ["2147483647"] } : node.cmd ? { Cmd: node.cmd } : {}),
          ...(node.user ? { User: node.user } : {}),
          ...(node.env ? { Env: node.env } : {}),
          Hostname: node.hostname,
          Labels: { [LABELS.lab]: lab, [LABELS.device]: node.device, [LABELS.fingerprint]: plan.fingerprint, [LABELS.image]: node.imageId },
          HostConfig: {
            NetworkMode: "none", Init: node.run !== "image", Memory: node.memory * MB, CapAdd: ["NET_ADMIN", ...node.caps], Privileged: node.privileged,
            ...(node.run === "vm" ? { Devices: vmDevices() } : {}),
          },
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
      // what each one starts once wired: left running, it does not hold the deployment
      await Promise.all(plan.nodes.filter(node => node.startup.length).map(async node => {
        const container = (await docker.list({ [LABELS.lab]: lab, [LABELS.device]: node.device }))[0];
        if(container) await docker.execDetached(container.Id, ["/bin/sh", "-c", node.startup.join("\n")]);
      }));
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

/** the same commands in RouterOS's CLI */
export function routerosOf(command: Command, target: string | undefined): string | null {
  if(!argvOf(command, target)) return null;
  switch(command){
    case "ping": return `/ping ${target} count=4`;
    case "traceroute": return `/tool traceroute ${target} count=1 max-hops=15`;
    case "addresses": return "/ip address print";
    case "routes": return "/ip route print";
    case "neighbours": return "/ip arp print";
  }
}

export async function execute(lab: string, device: string, command: Command, target: string | undefined, t: T = spanish) {
  const argv = argvOf(command, target);
  if(!argv) throw new Error(t("Escribe un destino válido: una IP o un nombre."));
  const container = await containerOf(lab, device, t);
  if(IMAGES[container.Labels[LABELS.image] as ImageId]?.config === "routeros"){
    const line = routerosOf(command, target)!;
    return { command: line, ...(await docker.exec(container.Id, ["vr-cli", line], 120_000)) };
  }
  return { command: argv.join(" "), ...(await docker.exec(container.Id, argv)) };
}

/** the terminal size a shell starts with, and is changed to */
export interface Size {
  cols: number;
  rows: number;
}

/** an interactive shell on a device: one of its image's (vtysh on a router,
 * bash, sh), the first one when none is asked */
export async function openShell(lab: string, device: string, size: Size, shell: string | undefined, t: T = spanish) {
  const container = await containerOf(lab, device, t);
  const image = IMAGES[container.Labels[LABELS.image] as ImageId] ?? IMAGES.alpine;
  const chosen = image.shells.find(item => item.id === shell) ?? image.shells[0];
  return docker.shell(container.Id, chosen.cmd, size);
}

/** what Docker has of an image: none until a lab first pulls it */
export async function imageStatus(info: ImageInfo) {
  const image = await docker.image(info.ref);
  return {
    ...info,
    pulled: Boolean(image),
    // a privileged one is downloaded, but runs only where the server allows it
    allowed: !info.privileged || ALLOW_PRIVILEGED,
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
