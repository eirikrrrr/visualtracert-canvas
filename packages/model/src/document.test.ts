import { describe, expect, it } from "vitest";
import { parse, serialize } from "./document";
import { exampleTopology } from "./example";
import { networkFingerprint, updateDevice } from "./topology";
import { isStarted, updateZone } from "./zones";

describe("document", () => {
  it.each(["yaml", "json"] as const)("round-trips the example as %s", format => {
    const topology = exampleTopology();
    const parsed = parse(serialize(topology, format), format);
    expect(parsed.problems).toEqual([]);
    expect(parsed.topology).toEqual(topology);
  });

  it("writes the devices inside their topologies, and reads the first version", () => {
    const text = serialize(exampleTopology(), "yaml");
    expect(text).toMatch(/^topology:\n  - id: internet\n    name: Internet\n    status: start\n    color: "#0fa5b5"/m);
    expect(text).not.toMatch(/^devices:/m);
    expect(text).toContain("options:\n  decorations: true");
    const old = parse("version: 1\nname: Viejo\ndevices:\n  - id: pc\n    type: pc\n    interfaces:\n      - name: eth0\n", "yaml");
    expect(old.topology?.devices.map(device => device.id)).toEqual(["pc"]);
    expect(serialize(old.topology!, "yaml")).toMatch(/topology:\n  - id: topology-1\n    name: Viejo/);
  });

  it("checks the topologies, their status and the options", () => {
    const text = [
      "options: { decorations: maybe }",
      "topology:",
      "  - id: a",
      "    status: running",
      "    color: blue",
      "    devices:",
      "      - id: pc",
      "        type: pc",
      "        status: later",
      "  - id: a",
    ].join("\n");
    const messages = parse(text, "yaml").problems.map(problem => problem.message).join("\n");
    expect(messages).toMatch(/decorations/);
    expect(messages).toMatch(/start, stop o hybrid/);
    expect(messages).toMatch(/color "blue"/);
    expect(messages).toMatch(/status es start o stop/);
    expect(messages).toMatch(/"a" está repetida/);
  });

  it("writes addresses as ip/prefix and links as device:interface", () => {
    const text = serialize(exampleTopology(), "yaml");
    expect(text).toContain("ip: 192.168.21.10/24");
    expect(text).toContain("a: switch-1:Fa0/2");
  });

  it("writes the services, the DHCP interfaces and the relays", () => {
    const text = serialize(exampleTopology(), "yaml");
    expect(text).toContain("dhcp: true");
    expect(text).toContain("relay: 192.168.21.2");
    expect(text).toContain("dns: 8.8.8.8");
    expect(text).toMatch(/services:\n\s+dhcp:/);
  });

  it("checks the services", () => {
    const text = [
      "devices:",
      "  - id: srv",
      "    type: server",
      "    services:",
      "      dhcp:",
      "        - { network: 10.0.0.0/24, start: 10.0.1.5, end: 10.0.0.50 }",
      "      dns:",
      "        - { name: www.x.com, ip: nope }",
    ].join("\n");
    const parsed = parse(text, "yaml");
    expect(parsed.topology).toBeNull();
    expect(parsed.problems.map(problem => problem.line)).toEqual([6, 8]);
  });

  it("reports problems with their YAML line and keeps the topology out", () => {
    const text = [
      "version: 1",
      "name: Roto",
      "devices:",
      "  - id: pc-a",
      "    type: pc",
      "    interfaces:",
      "      - name: eth0",
      "        ip: 10.0.0.300/24",
      "links:",
      "  - a: pc-a:eth0",
      "    b: nadie:eth0",
    ].join("\n");
    const result = parse(text, "yaml");
    expect(result.topology).toBeNull();
    expect(result.problems.map(p => p.line)).toEqual([8, 11]);
    expect(result.problems[0].message).toMatch(/no es una dirección válida/);
  });

  it("rejects an unknown device type and a port cabled twice", () => {
    const text = JSON.stringify({
      devices: [
        { id: "a", type: "tostadora", interfaces: [{ name: "eth0" }] },
        { id: "b", type: "pc", interfaces: [{ name: "eth0" }] },
        { id: "c", type: "pc", interfaces: [{ name: "eth0" }] },
      ],
      links: [{ a: "a:eth0", b: "b:eth0" }, { a: "a:eth0", b: "c:eth0" }],
    });
    const result = parse(text, "json");
    expect(result.problems.map(p => p.message).join(" ")).toMatch(/tostadora.*ya tiene otro cable/s);
  });

  it("fills a missing MAC with a valid one", () => {
    const result = parse("devices:\n  - id: x\n    type: pc\n    interfaces:\n      - name: eth0\n", "yaml");
    expect(result.topology?.devices[0].interfaces[0].mac).toMatch(/^02:/);
  });
});

describe("networkFingerprint", () => {
  it("ignores the drawing but not the network", () => {
    const topology = exampleTopology();
    const moved = { ...topology, name: "Otro", devices: topology.devices.map(device => ({ ...device, position: { x: 0, y: 0 }, name: `${device.name}!` })) };
    expect(networkFingerprint(moved)).toBe(networkFingerprint(topology));
    const rerouted = updateDevice(topology, "router-1", device => ({ ...device, routes: [] }));
    expect(networkFingerprint(rerouted)).not.toBe(networkFingerprint(topology));
  });
});

describe("topologies", () => {
  it("starts all of one, none, or (hybrid) the devices with status start", () => {
    const base = exampleTopology();
    const started = (topology: typeof base) => topology.devices.filter(device => isStarted(topology, device)).map(device => device.id);
    expect(started(base)).toHaveLength(base.devices.length);
    const stopped = updateZone(base, "internet", zone => ({ ...zone, status: "stop" }));
    expect(started(stopped)).not.toContain("isp");
    const hybrid = updateDevice(updateZone(base, "internet", zone => ({ ...zone, status: "hybrid" })), "dns", device => ({ ...device, status: "start" }));
    expect(started(hybrid)).toContain("dns");
    expect(started(hybrid)).not.toContain("isp");
    // what starts is part of the network the emulator builds
    expect(networkFingerprint(hybrid)).not.toBe(networkFingerprint(base));
  });
});
