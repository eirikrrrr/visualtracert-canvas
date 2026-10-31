// The database: one SQLite file (DATA_DIR/visual-tracert.db), in WAL mode
// (reads go on while one write is made). Its schema grows by migrations, in
// order; PRAGMA user_version says how many it has had.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const MIGRATIONS = [
  // 1: accounts, their sessions and the invitations to create them
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
    password TEXT NOT NULL,
    disabled INTEGER NOT NULL DEFAULT 0,
    -- a password set by an admin: changed at the next sign-in
    must_change INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_login INTEGER
  );
  CREATE TABLE sessions (
    -- the token's SHA-256: the token itself only lives in the cookie
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    user_agent TEXT
  );
  CREATE INDEX sessions_user ON sessions (user_id);
  CREATE TABLE invites (
    code TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
    uses_left INTEGER NOT NULL,
    expires_at INTEGER,
    note TEXT,
    created_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );
  `,
];

/** opens (or creates) the database at that path (":memory:" for tests), migrated */
export function openDatabase(path: string): DatabaseSync {
  if(path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const { user_version: done } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for(let i = done; i < MIGRATIONS.length; i++){
    db.exec("BEGIN");
    try{
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
    }catch(error){
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return db;
}
