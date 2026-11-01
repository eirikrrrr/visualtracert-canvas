import { afterEach, describe, expect, it } from "vitest";
import { exerciseById, EXERCISES, listedExercises, xpOf } from "./exercises";
import { applyMachines, checkMachine, MachineError } from "./machines";

const lab = (name: string) => ({ version: 4, name, devices: [{ id: "pc", type: "pc", name: "PC", x: 0, y: 0, interfaces: [{ name: "eth0", mac: "02:00:00:00:00:01" }] }], links: [] });
const custom = {
  box: "routing", level: 2, codename: "Isla Nueva", title: "Una red nueva", story: "Una historia.", summary: "Qué hacer.",
  protocols: ["ipv4"], goals: [{ text: "El PC hace ping", check: { kind: "ping", from: "pc", to: "10.0.0.1" } }], hints: ["Una pista"],
  start: lab("Empieza"), solution: lab("Resuelta"),
};

afterEach(() => applyMachines([]));

describe("the admins' machines", () => {
  it("edits one of the app's machines, and undoes it when applied again without it", () => {
    const base = exerciseById("first-network")!;
    const before = { codename: base.codename, xp: xpOf(base, "easy") };
    applyMachines([{ id: "first-network", edit: checkMachine("first-network", { codename: "Otro Nombre", xp: 55, hidden: true }).edit, updatedAt: 1 }]);
    const edited = exerciseById("first-network")!;
    expect(edited.codename).toBe("Otro Nombre");
    expect(xpOf(edited, "medium")).toBe(110);
    expect(listedExercises().some(item => item.id === "first-network")).toBe(false);
    applyMachines([]);
    expect(exerciseById("first-network")).toMatchObject({ codename: before.codename });
    expect(xpOf(exerciseById("first-network")!, "easy")).toBe(before.xp);
  });

  it("adds a machine made from a lab, that builds its start and solves to its end", () => {
    const record = { id: "isla-nueva", ...checkMachine("isla-nueva", custom), updatedAt: 1 };
    const count = EXERCISES.length;
    applyMachines([record]);
    expect(EXERCISES.length).toBe(count + 1);
    const machine = exerciseById("isla-nueva")!;
    expect(machine).toMatchObject({ custom: true, codename: "Isla Nueva", level: 2 });
    expect(machine.build().name).toBe("Empieza");
    expect(machine.solve(machine.build()).name).toBe("Resuelta");
    expect(machine.cli).toBeUndefined();
  });

  it("refuses what is not right", () => {
    expect(() => checkMachine("Bad Id", custom)).toThrow(MachineError);
    expect(() => checkMachine("isla", { ...custom, goals: [{ text: "x", check: { kind: "ping", from: "nobody", to: "pc" } }] })).toThrow(MachineError);
    expect(() => checkMachine("isla", { ...custom, start: { version: 4, name: "x", devices: [], links: [] } })).toThrow(MachineError);
    expect(() => checkMachine("first-network", { xp: -1 })).toThrow(MachineError);
    expect(() => checkMachine("first-network", { protocols: ["smtp"] })).toThrow(MachineError);
  });
});
