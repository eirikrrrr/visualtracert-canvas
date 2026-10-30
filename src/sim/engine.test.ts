import { describe, expect, it } from "vitest";
import { exampleTopology } from "../model/example";
import { updateDevice } from "../model/topology";
import type { Topology } from "../model/types";
import { simulatePing } from "./engine";

const path = (_topology: Topology, run: ReturnType<typeof simulatePing>) =>
  run.events.filter(event => event.from).map(event => `${event.protocol} ${event.from}→${event.to}`);

describe("simulatePing", () => {
  it("pings a host of the same LAN through a switch: ARP first, then ICMP", () => {
    const topology = exampleTopology();
    const run = simulatePing(topology, { from: "pc-1", to: "192.168.21.11" });
    expect(run.outcome.ok).toBe(true);
    const hops = path(topology, run);
    // ARP request reaches the switch, is flooded, PC 2 answers
    expect(hops[0]).toBe("ARP pc-1→switch-1");
    expect(hops).toContain("ARP switch-1→pc-2");
    expect(hops).toContain("ARP pc-2→switch-1");
    // the echo and its reply go only to their port once the switch learned them
    expect(hops.filter(hop => hop.startsWith("ICMP"))).toEqual([
      "ICMP pc-1→switch-1", "ICMP switch-1→pc-2", "ICMP pc-2→switch-1", "ICMP switch-1→pc-1",
    ]);
    expect(run.outcome.rtt).toBeGreaterThan(0);
  });

  it("floods an unknown destination but forwards a learned one", () => {
    const run = simulatePing(exampleTopology(), { from: "pc-1", to: "192.168.21.11" });
    const flood = run.events.find(event => event.to === "switch-1" && event.protocol === "ARP");
    expect(flood?.result).toBe("flooded");
    const reply = run.events.find(event => event.to === "switch-1" && event.frame.ip?.icmp.type === "echo-reply");
    expect(reply?.result).toBe("forwarded");
  });

  it("crosses the router to the other LAN, with the TTL lowered by one", () => {
    const run = simulatePing(exampleTopology(), { from: "pc-1", to: "192.168.31.8" });
    expect(run.outcome.ok).toBe(true);
    const arrived = run.events.find(event => event.to === "laptop-1" && event.frame.ip?.icmp.type === "echo-request");
    expect(arrived?.frame.ip?.ttl).toBe(63);
    // the router asked for the laptop's MAC on its second LAN
    expect(run.events.some(event => event.from === "router-1" && event.frame.arp?.targetIp === "192.168.31.8")).toBe(true);
    expect(run.outcome.message).toMatch(/Respuesta de 192\.168\.31\.8/);
  });

  it("reaches the ISP through the default route", () => {
    const run = simulatePing(exampleTopology(), { from: "laptop-1", to: "203.0.113.1" });
    expect(run.outcome.ok).toBe(true);
  });

  it("fails without a gateway, before anything leaves the PC", () => {
    const topology = updateDevice(exampleTopology(), "pc-1", device => ({ ...device, gateway: undefined }));
    const run = simulatePing(topology, { from: "pc-1", to: "192.168.31.8" });
    expect(run.outcome.ok).toBe(false);
    expect(run.outcome.message).toMatch(/puerta de enlace/);
    expect(run.events).toHaveLength(1);
  });

  it("reports an unanswered ARP for an address nobody has", () => {
    const run = simulatePing(exampleTopology(), { from: "pc-1", to: "192.168.21.99" });
    expect(run.outcome.ok).toBe(false);
    expect(run.outcome.message).toMatch(/Nadie respondió al ARP/);
  });

  it("gets 'destination unreachable' from a router without a route", () => {
    const topology = updateDevice(exampleTopology(), "router-1", device => ({ ...device, routes: [] }));
    const run = simulatePing(topology, { from: "pc-1", to: "8.8.8.8" });
    expect(run.outcome.ok).toBe(false);
    expect(run.outcome.message).toMatch(/inalcanzable/);
  });

  it("gets 'time exceeded' when the TTL runs out", () => {
    const run = simulatePing(exampleTopology(), { from: "pc-1", to: "203.0.113.1", ttl: 1 });
    expect(run.outcome.ok).toBe(false);
    expect(run.outcome.message).toMatch(/TTL/);
  });

  it("keeps VLANs apart on a switch", () => {
    const topology = updateDevice(exampleTopology(), "switch-1", device => ({
      ...device,
      interfaces: device.interfaces.map(port => port.name === "Fa0/3" ? { ...port, vlan: 20 } : port),
    }));
    const run = simulatePing(topology, { from: "pc-1", to: "192.168.21.11" });
    expect(run.outcome.ok).toBe(false);
    expect(run.events.some(event => event.to === "pc-2")).toBe(false);
  });

  it("does not let a frame leave a port without a cable", () => {
    const topology = { ...exampleTopology(), links: exampleTopology().links.filter(link => link.id !== "l5") };
    const run = simulatePing(topology, { from: "pc-1", to: "192.168.21.11" });
    expect(run.outcome.ok).toBe(false);
    expect(run.events[0].notes.join(" ")).toMatch(/no tiene cable/);
  });
});
