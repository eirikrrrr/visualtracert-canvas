import { describe, expect, it } from "vitest";
import { exampleTopology, keysIn, placeholders, templateById } from "@visual-tracert/model";
import { DICTIONARIES, translator } from ".";
import { simulate } from "../sim/engine";

// every source of the web and of the shared model, but the tests and the
// translation modules themselves
const files = import.meta.glob([
  "../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}", "!./**",
  "../../../../packages/model/src/**/*.ts", "!../../../../packages/model/src/**/*.test.ts", "!../../../../packages/model/src/i18n/**",
], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const used = new Set(Object.values(files).flatMap(keysIn));

describe("translations", () => {
  it("finds the texts of the code", () => {
    expect(used.size).toBeGreaterThan(300);
    expect(used.has("Hacer ping")).toBe(true);
  });

  it.each(Object.entries(DICTIONARIES))("%s has every text, with the same {values}", (_lang, dictionary) => {
    const missing = [...used].filter(key => !(key in dictionary));
    expect(missing).toEqual([]);
    const wrong = [...used].filter(key => placeholders(key).join() !== placeholders(dictionary[key]).join());
    expect(wrong).toEqual([]);
  });

  it.each(Object.entries(DICTIONARIES))("%s has no texts the code no longer uses", (_lang, dictionary) => {
    expect(Object.keys(dictionary).filter(key => !used.has(key))).toEqual([]);
  });

  it("fills in the values and falls back to Spanish", () => {
    expect(translator("es")("Sin ruta hacia {dst}.", { dst: "10.0.0.1" })).toBe("Sin ruta hacia 10.0.0.1.");
    expect(translator("en")("texto que no existe")).toBe("texto que no existe");
  });

  it("runs the simulator in the chosen language", () => {
    const run = (lang: "en" | "pt") => simulate(exampleTopology(translator(lang)), { kind: "ping", from: "pc-1", to: "www.ejemplo.com" }, translator(lang));
    expect(run("en").outcome.message).toMatch(/^Reply from 8\.8\.8\.8: time/);
    expect(run("en").console[0]).toBe("Pinging www.ejemplo.com [8.8.8.8] with 32 bytes of data:");
    expect(run("pt").outcome.message).toMatch(/^Resposta de 8\.8\.8\.8: tempo/);
    expect(run("en").events.find(event => event.protocol === "ARP")?.summary).toMatch(/^Who has/);
  });

  it("builds a template in the chosen language", () => {
    const lab = templateById("vlans")!.build(translator("en"));
    expect(lab.name).toBe("VLANs on a switch");
    expect(lab.devices.map(device => device.name)).toContain("Sales 1");
    expect(lab.description).toMatch(/What to try:/);
  });
});
