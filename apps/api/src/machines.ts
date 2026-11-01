// The machines as the admins changed them (see the model's machines.ts): kept
// here and applied to the model's EXERCISES when the service starts and on
// every change, so the ranking counts their points. And the files uploaded
// for them: pictures (PNG, JPEG, WebP; no SVG, which could carry a script) and
// walkthroughs as PDF.
import { applyMachines, checkMachine, MachineError, type MachineRecord } from "@visual-tracert/model";
import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { AccountError } from "./accounts";

export const FILE_TYPES: Record<string, number> = {
  "image/png": 2 * 1024 * 1024,
  "image/jpeg": 2 * 1024 * 1024,
  "image/webp": 2 * 1024 * 1024,
  "application/pdf": 10 * 1024 * 1024,
};

/** a file's first bytes, as its type says they should be */
const MAGIC: Record<string, (data: Buffer) => boolean> = {
  "image/png": data => data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": data => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff,
  "image/webp": data => data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP",
  "application/pdf": data => data.subarray(0, 5).toString("latin1") === "%PDF-",
};

export class Machines {
  constructor(private readonly db: DatabaseSync, private readonly now: () => number = Date.now) {
    this.apply();
  }

  list(): MachineRecord[] {
    const rows = this.db.prepare("SELECT id, data, updated_at FROM machines ORDER BY id").all() as { id: string; data: string; updated_at: number }[];
    return rows.map(row => ({ id: row.id, ...JSON.parse(row.data), updatedAt: row.updated_at }));
  }

  private apply(): void {
    applyMachines(this.list());
  }

  /** an edit of one of the app's machines, or one of their own (made or changed) */
  put(id: string, data: Record<string, unknown>, by: number): MachineRecord {
    let checked: Pick<MachineRecord, "edit" | "custom">;
    try{ checked = checkMachine(id, data); }
    catch(error){ if(error instanceof MachineError) throw new AccountError("bad-machine", 400, error.message); throw error; }
    for(const file of [checked.edit?.image ?? checked.custom?.image, checked.edit?.pdf ?? checked.custom?.pdf]){
      if(file && !this.db.prepare("SELECT 1 FROM files WHERE id = ?").get(file)) throw new AccountError("bad-machine", 400, "file");
    }
    const at = this.now();
    this.db.prepare("INSERT INTO machines (id, data, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
      .run(id, JSON.stringify(checked), at, by);
    this.apply();
    return { id, ...checked, updatedAt: at };
  }

  /** back to the app's own (an edit), or gone (one of their own) */
  remove(id: string): void {
    if(!this.db.prepare("DELETE FROM machines WHERE id = ?").run(id).changes) throw new AccountError("not-found", 404);
    this.apply();
  }

  addFile(mime: string, data: Buffer, by: number): { id: string; mime: string; size: number } {
    const limit = FILE_TYPES[mime];
    if(!limit || !MAGIC[mime](data)) throw new AccountError("bad-file", 415);
    if(data.length > limit) throw new AccountError("too-large", 413);
    const id = randomBytes(16).toString("hex");
    this.db.prepare("INSERT INTO files (id, mime, data, size, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)").run(id, mime, data, data.length, this.now(), by);
    return { id, mime, size: data.length };
  }

  file(id: string): { mime: string; data: Buffer } | undefined {
    const row = this.db.prepare("SELECT mime, data FROM files WHERE id = ?").get(id) as { mime: string; data: Uint8Array } | undefined;
    return row ? { mime: row.mime, data: Buffer.from(row.data) } : undefined;
  }
}
