import { describe, expect, it } from "vitest";
import { parse, serialize } from "./document";
import { exampleTopology } from "./example";

describe("document", () => {
  it.each(["yaml", "json"] as const)("round-trips the example as %s", format => {
    const topology = exampleTopology();
    const parsed = parse(serialize(topology, format), format);
    expect(parsed.problems).toEqual([]);
    expect(parsed.topology).toEqual(topology);
  });

  it("writes addresses as ip/prefix and links as device:interface", () => {
    const text = serialize(exampleTopology(), "yaml");
    expect(text).toContain("ip: 192.168.21.10/24");
    expect(text).toContain("a: switch-1:Fa0/2");
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
