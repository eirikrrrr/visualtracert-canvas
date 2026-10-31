// A lab running for real: its plan executed (containers started, veth
// pairs moved into their namespaces, each device configured), its state read
// back from Docker, and the few commands a user can run on its devices. The
// containers carry the lab's labels, so the state survives a restart of the
// emulator and a lab can always be cleaned up.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { IMAGES, isIp, spanish, type ImageId, type ImageInfo, type T, type Topology } from "@visual-tracert/model";
import { docker, DockerError, type ContainerSummary } from "./docker";
import { LABELS, planLab, type LinkPlan, type NodePlan, type Plan, type ProfileCatalog } from "./plan";
import { loadProfiles, profileStatus } from "./profiles";
import { contextHash, ensureImage, HASH, vmDevices } from "./vrnetlab";

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
// change its own network (NET_ADMIN, in its namespace only) from its CLI.
// Temporary (--rm): stopped, it is gone with what it wrote, since the lab's
// configuration lives in its document and is applied at every deployment
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
  /** it runs an older build of its image (a machine's): deploying again updates it */
  outdated: boolean;
}

export interface LabState {
  lab: string;
  deployed: boolean;
  fingerprint: string | null;
  devices: DeviceState[];
}

const containersOf = (lab: string) => docker.list({ [LABELS.lab]: lab });

async function stateOf(lab: string, containers: ContainerSummary[]): Promise<LabState> {
  const devices = await Promise.all(containers.map(async container => {
    const own = IMAGES[container.Labels[LABELS.image] as ImageId]?.vrnetlab;
    return {
      device: container.Labels[LABELS.device],
      container: container.Names[0]?.replace(/^\//, "") ?? container.Id.slice(0, 12),
      state: container.State,
      outdated: Boolean(own) && container.Labels[HASH] !== await contextHash(own!),
    };
  }));
  return {
    lab,
    deployed: containers.length > 0,
    fingerprint: containers[0]?.Labels[LABELS.fingerprint] ?? null,
    devices: devices.sort((p, q) => p.device.localeCompare(q.device)),
  };
}

export async function status(lab: string): Promise<LabState> {
  return stateOf(lab, await containersOf(lab));
}

async function removeAll(lab: string): Promise<void> {
  await Promise.all((await containersOf(lab)).map(container => docker.remove(container.Id).catch(error => {
    // a temporary one may be going already, on its own
    if(!(error instanceof DockerError && (error.status === 404 || error.status === 409))) throw error;
  })));
}

export function destroy(lab: string): Promise<LabState> {
  return serial(lab, async () => {
    await removeAll(lab);
    return status(lab);
  });
}

// the plan of a lab: the profiles it can use, and what this server allows
async function planOf(lab: string, topology: Topology, t: T): Promise<Plan> {
  const profiles: ProfileCatalog = new Map(await Promise.all((await loadProfiles()).map(async profile =>
    [profile.id, { profile, ready: (await profileStatus(profile)).state === "built" }] as const)));
  return planLab(lab, topology, t, profiles, { allowPrivileged: ALLOW_PRIVILEGED });
}

/** a device's container, created and started: its process, as the host sees it */
async function startNode(lab: string, plan: Plan, node: NodePlan): Promise<number> {
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
      NetworkMode: "none", AutoRemove: true, Init: node.run !== "image", Memory: node.memory * MB, CapAdd: ["NET_ADMIN", ...node.caps], Privileged: node.privileged,
      ...(node.run === "vm" ? { Devices: vmDevices() } : {}),
    },
  });
  await docker.start(id);
  return docker.pid(id);
}

/** a cable: a veth pair here, each end moved into its device */
async function cable(link: LinkPlan, pids: Map<string, number>): Promise<void> {
  await host(["ip", "link", "add", link.a.temp, "type", "veth", "peer", "name", link.b.temp]);
  await host(["ip", "link", "set", link.a.temp, "netns", String(pids.get(link.a.device))]);
  await host(["ip", "link", "set", link.b.temp, "netns", String(pids.get(link.b.device))]);
}

const inside = (pid: number | undefined, lines: string[]) => host(["nsenter", "-t", String(pid), "-n", "sh", "-ec", lines.join("\n")]);

/** what a device starts once wired: left running, it does not hold the lab */
async function startup(lab: string, node: NodePlan): Promise<void> {
  if(!node.startup.length) return;
  const container = (await docker.list({ [LABELS.lab]: lab, [LABELS.device]: node.device }))[0];
  if(container) await docker.execDetached(container.Id, ["/bin/sh", "-c", node.startup.join("\n")]);
}

/** builds the lab from its topology, after removing what was running */
export function deploy(lab: string, topology: Topology, t: T = spanish): Promise<LabState & { warnings: string[] }> {
  return serial(lab, async () => {
    const plan = await planOf(lab, topology, t);
    await removeAll(lab);
    for(const image of new Set(plan.nodes.map(node => node.image))) await ensureImage(image);
    const pids = new Map<string, number>();
    try{
      await Promise.all(plan.nodes.map(async node => pids.set(node.device, await startNode(lab, plan, node))));
      for(const link of plan.links) await cable(link, pids);
      await Promise.all(plan.nodes.map(node => inside(pids.get(node.device), node.script)));
      await Promise.all(plan.nodes.map(node => startup(lab, node)));
    }catch(error){
      // whatever was half built goes: the ends still here, and the containers
      await Promise.all(plan.links.map(link => host(["ip", "link", "del", link.a.temp]).catch(() => undefined)));
      await removeAll(lab).catch(() => undefined);
      throw new Error(t("No se pudo desplegar el laboratorio: {error}", { error: (error as Error).message }));
    }
    return { ...(await status(lab)), warnings: plan.warnings };
  });
}

/** Restarts some devices of a deployed lab, the rest left running: their
 * containers made anew, their cables too, and at the other end of each one
 * the port configured again (its address, its bridge, its routes). The lab
 * must be as it was deployed: a changed topology is deployed again instead. */
export function restart(lab: string, topology: Topology, devices: string[], t: T = spanish): Promise<LabState & { warnings: string[] }> {
  return serial(lab, async () => {
    const plan = await planOf(lab, topology, t);
    const containers = await containersOf(lab);
    if(!containers.length) throw new Error(t("El laboratorio no está desplegado."));
    if(containers[0].Labels[LABELS.fingerprint] !== plan.fingerprint) throw new Error(t("La topología cambió desde el despliegue: vuelve a desplegar en lugar de reiniciar."));
    const chosen = plan.nodes.filter(node => devices.includes(node.device));
    if(!chosen.length) throw new Error(t("Ninguno de esos equipos se inicia en este laboratorio."));
    const names = new Set(chosen.map(node => node.device));
    for(const image of new Set(chosen.map(node => node.image))) await ensureImage(image);

    // gone, with their cables (both ends: a veth goes with its namespace)
    await Promise.all(containers.filter(container => names.has(container.Labels[LABELS.device])).map(container => docker.remove(container.Id).catch(error => {
      if(!(error instanceof DockerError && (error.status === 404 || error.status === 409))) throw error;
    })));
    const pids = new Map<string, number>();
    for(const container of containers.filter(item => !names.has(item.Labels[LABELS.device]) && item.State === "running")){
      pids.set(container.Labels[LABELS.device], await docker.pid(container.Id));
    }
    // their cables; only to devices running (one stopped on its own is not)
    const links = plan.links.filter(link => names.has(link.a.device) || names.has(link.b.device));
    try{
      await Promise.all(chosen.map(async node => pids.set(node.device, await startNode(lab, plan, node))));
      const wired = links.filter(link => pids.has(link.a.device) && pids.has(link.b.device));
      for(const link of wired) await cable(link, pids);
      await Promise.all(chosen.map(node => inside(pids.get(node.device), node.script)));
      // at the other end: the port again (once its old end is gone), then the tail
      const others = new Map<string, string[]>();
      for(const end of wired.flatMap(link => [link.a, link.b]).filter(end => !names.has(end.device))){
        others.set(end.device, [...others.get(end.device) ?? [], end.ifname]);
      }
      await Promise.all([...others].map(([device, ifnames]) => {
        const node = plan.nodes.find(item => item.device === device)!;
        return inside(pids.get(device), [
          ...ifnames.flatMap(ifname => [
            `i=0; while ip link show dev ${ifname} >/dev/null 2>&1 && [ $i -lt 100 ]; do i=$((i + 1)); sleep 0.1; done`,
            ...node.ports[ifname] ?? [],
            ...node.retap?.[ifname] ?? [],
          ]),
          ...node.tail,
        ]);
      }));
      await Promise.all(chosen.map(node => startup(lab, node)));
    }catch(error){
      await Promise.all(links.map(link => host(["ip", "link", "del", link.a.temp]).catch(() => undefined)));
      throw new Error(t("No se pudo reiniciar: {error}", { error: (error as Error).message }));
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
