import { describe, expect, it } from "vitest";
import { Accounts } from "./accounts";
import { openDatabase } from "./db";
import { LIMITS, UserData } from "./userdata";

const doc = (name: string) => JSON.stringify({ version: 4, name, topology: [], links: [] });

async function setup() {
  const db = openDatabase(":memory:");
  let clock = 1_000_000;
  const accounts = new Accounts(db);
  const ana = await accounts.setup({ username: "ana", name: "Ana", password: "a-long-password" });
  const bob = (await accounts.register({ invite: accounts.createInvite(ana.id, { role: "student" }).code, username: "bob", name: "Bob", password: "a-long-password" }));
  return { data: new UserData(db, () => clock), ana: ana.id, bob: bob.id, tick: (ms: number) => { clock += ms; return clock; } };
}

describe("what each account keeps", () => {
  it("saves labs per account, the newer change winning", async () => {
    const { data, ana, bob, tick } = await setup();
    data.saveLab(ana, "lab-1", { document: doc("Uno"), updatedAt: tick(0) });
    expect(data.labs(ana)).toMatchObject([{ id: "lab-1", name: "Uno" }]);
    expect(data.labs(bob)).toEqual([]);
    expect(() => data.lab(bob, "lab-1")).toThrow();
    // an older copy (another browser that was offline) does not overwrite it
    const kept = data.saveLab(ana, "lab-1", { document: doc("Viejo"), updatedAt: 1 });
    expect(kept).toMatchObject({ kept: true, name: "Uno" });
    expect(() => data.saveLab(ana, "lab-2", { document: "not json" })).toThrow();
    expect(() => data.saveLab(ana, "bad id!", { document: doc("x") })).toThrow();
    expect(() => data.saveLab(ana, "big", { document: doc("x".repeat(LIMITS.document)) })).toThrow();
    data.deleteLab(ana, "lab-1");
    expect(data.labs(ana)).toEqual([]);
  });

  it("keeps earlier versions, one every ten minutes at most, and the last ten", async () => {
    const { data, ana, tick } = await setup();
    data.saveLab(ana, "lab", { document: doc("v0"), updatedAt: tick(0) });
    data.saveLab(ana, "lab", { document: doc("v1"), updatedAt: tick(1000) });
    // the next change within ten minutes keeps no new version
    data.saveLab(ana, "lab", { document: doc("v2"), updatedAt: tick(1000) });
    expect(data.versions(ana, "lab").map(item => item.name)).toEqual(["v0"]);
    for(let i = 3; i < 20; i++) data.saveLab(ana, "lab", { document: doc(`v${i}`), updatedAt: tick(11 * 60 * 1000) });
    const versions = data.versions(ana, "lab");
    expect(versions).toHaveLength(10);
    expect(versions[0].name).toBe("v18");
    expect(JSON.parse(data.version(ana, "lab", versions[0].savedAt).document).name).toBe("v18");
  });

  it("caps the labs of an account, and keeps its settings", async () => {
    const { data, ana } = await setup();
    for(let i = 0; i < LIMITS.labs; i++) data.saveLab(ana, `l${i}`, { document: doc(`${i}`) });
    expect(() => data.saveLab(ana, "one-more", { document: doc("x") })).toThrow(/too-many-labs/);
    expect(data.settings(ana)).toEqual({ data: null, updatedAt: null });
    data.saveSettings(ana, { data: { prefs: { theme: "dark" } } });
    expect(data.settings(ana).data).toEqual({ prefs: { theme: "dark" } });
  });
});
