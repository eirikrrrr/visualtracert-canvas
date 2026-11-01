// What each account keeps (phase B): its labs and its settings. A lab is its
// topology document, saved as the browser sends it (checked as a document)
// with the browser's time of the change: the newer one wins when two browsers
// save the same lab. Saving keeps the lab's previous document as a version
// when the last version is older than VERSION_EVERY, and the last VERSIONS of
// them. The settings are one JSON object (profile, preferences, practice's
// progress), replaced whole.
import { parse } from "@visual-tracert/model";
import type { DatabaseSync } from "node:sqlite";
import { AccountError } from "./accounts";

export const LIMITS = {
  /** labs per account */
  labs: Number(process.env.MAX_SAVED_LABS) || 50,
  /** a lab's document, in bytes */
  document: 512 * 1024,
  /** the settings, in bytes (a profile photo is a few KB) */
  settings: 256 * 1024,
};
const VERSIONS = 10;
const VERSION_EVERY = 10 * 60 * 1000;
const LAB_ID = /^[A-Za-z0-9_-]{1,80}$/;

export interface LabMeta {
  id: string;
  name: string;
  updatedAt: number;
  size: number;
}

export class UserData {
  constructor(private readonly db: DatabaseSync, private readonly now: () => number = Date.now) {}

  labs(user: number): LabMeta[] {
    return (this.db.prepare("SELECT id, name, updated_at, size FROM labs WHERE user_id = ? ORDER BY updated_at DESC").all(user) as { id: string; name: string; updated_at: number; size: number }[])
      .map(row => ({ id: row.id, name: row.name, updatedAt: row.updated_at, size: row.size }));
  }

  lab(user: number, id: string): LabMeta & { document: string } {
    const row = this.db.prepare("SELECT id, name, updated_at, size, document FROM labs WHERE user_id = ? AND id = ?").get(user, id) as { id: string; name: string; updated_at: number; size: number; document: string } | undefined;
    if(!row) throw new AccountError("not-found", 404);
    return { id: row.id, name: row.name, updatedAt: row.updated_at, size: row.size, document: row.document };
  }

  /** saves a lab, unless the account's copy is newer: then it says so and keeps its own */
  saveLab(user: number, id: string, body: Record<string, unknown>): LabMeta & { kept?: boolean } {
    if(!LAB_ID.test(id) || typeof body.document !== "string") throw new AccountError("bad-lab");
    const document = body.document;
    const size = Buffer.byteLength(document);
    if(size > LIMITS.document) throw new AccountError("too-large", 413);
    const topology = parse(document, "json").topology;
    if(!topology) throw new AccountError("bad-lab");
    const at = this.now();
    const updatedAt = typeof body.updatedAt === "number" && Number.isFinite(body.updatedAt) ? Math.min(body.updatedAt, at + 60_000) : at;
    const name = (topology.name || id).slice(0, 120);
    this.db.exec("BEGIN IMMEDIATE");
    try{
      const old = this.db.prepare("SELECT name, document, updated_at FROM labs WHERE user_id = ? AND id = ?").get(user, id) as { name: string; document: string; updated_at: number } | undefined;
      if(old && old.updated_at > updatedAt){
        this.db.exec("COMMIT");
        return { ...this.lab(user, id), kept: true };
      }
      if(!old && (this.db.prepare("SELECT COUNT(*) AS n FROM labs WHERE user_id = ?").get(user) as { n: number }).n >= LIMITS.labs) throw new AccountError("too-many-labs", 409);
      if(old && old.document !== document){
        const last = this.db.prepare("SELECT MAX(saved_at) AS at FROM lab_versions WHERE user_id = ? AND lab_id = ?").get(user, id) as { at: number | null };
        if(!last.at || at - last.at >= VERSION_EVERY){
          this.db.prepare("INSERT OR REPLACE INTO lab_versions (user_id, lab_id, saved_at, name, document) VALUES (?, ?, ?, ?, ?)").run(user, id, old.updated_at, old.name, old.document);
          this.db.prepare("DELETE FROM lab_versions WHERE user_id = ? AND lab_id = ? AND saved_at NOT IN (SELECT saved_at FROM lab_versions WHERE user_id = ? AND lab_id = ? ORDER BY saved_at DESC LIMIT ?)").run(user, id, user, id, VERSIONS);
        }
      }
      this.db.prepare("INSERT INTO labs (user_id, id, name, document, size, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, id) DO UPDATE SET name = excluded.name, document = excluded.document, size = excluded.size, updated_at = excluded.updated_at")
        .run(user, id, name, document, size, updatedAt, at);
      this.db.exec("COMMIT");
    }catch(error){
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { id, name, updatedAt, size };
  }

  deleteLab(user: number, id: string): void {
    this.db.prepare("DELETE FROM labs WHERE user_id = ? AND id = ?").run(user, id);
  }

  versions(user: number, id: string): { savedAt: number; name: string; size: number }[] {
    this.lab(user, id);
    return (this.db.prepare("SELECT saved_at, name, length(document) AS size FROM lab_versions WHERE user_id = ? AND lab_id = ? ORDER BY saved_at DESC").all(user, id) as { saved_at: number; name: string; size: number }[])
      .map(row => ({ savedAt: row.saved_at, name: row.name, size: row.size }));
  }

  version(user: number, id: string, savedAt: number): { savedAt: number; name: string; document: string } {
    const row = this.db.prepare("SELECT saved_at, name, document FROM lab_versions WHERE user_id = ? AND lab_id = ? AND saved_at = ?").get(user, id, savedAt) as { saved_at: number; name: string; document: string } | undefined;
    if(!row) throw new AccountError("not-found", 404);
    return { savedAt: row.saved_at, name: row.name, document: row.document };
  }

  settings(user: number): { data: Record<string, unknown> | null; updatedAt: number | null } {
    const row = this.db.prepare("SELECT data, updated_at FROM user_settings WHERE user_id = ?").get(user) as { data: string; updated_at: number } | undefined;
    return row ? { data: JSON.parse(row.data), updatedAt: row.updated_at } : { data: null, updatedAt: null };
  }

  saveSettings(user: number, body: Record<string, unknown>): { updatedAt: number } {
    const data = body.data;
    if(!data || typeof data !== "object" || Array.isArray(data)) throw new AccountError("bad-request");
    const text = JSON.stringify(data);
    if(Buffer.byteLength(text) > LIMITS.settings) throw new AccountError("too-large", 413);
    const at = this.now();
    this.db.prepare("INSERT INTO user_settings (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at").run(user, text, at);
    return { updatedAt: at };
  }
}
