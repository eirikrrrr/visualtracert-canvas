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
  // 2: the exercises solved (the ranking, the machines' figures) and the seasons
  `
  CREATE TABLE solves (
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    exercise TEXT NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium')),
    -- the first time: who got there first
    solved_at INTEGER NOT NULL,
    -- the best time, in ms
    time_ms INTEGER,
    -- checked on the server (medium, on the lab's devices), not the page's word
    verified INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, exercise, difficulty)
  );
  CREATE INDEX solves_exercise ON solves (exercise, difficulty, solved_at);
  CREATE TABLE seasons (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    -- what it is about: a protocol (BGP, OSPF…), a topic
    theme TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    -- what its machines are based on
    inspiration TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#4f8cff',
    icon TEXT NOT NULL DEFAULT 'router',
    starts_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    -- the ids of its exercises, as JSON
    machines TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
  );
  `,
  // 3: what the admins changed of the machines (and the machines they made), and
  // the files they uploaded for them (pictures, walkthroughs as PDF)
  `
  CREATE TABLE machines (
    id TEXT PRIMARY KEY,
    -- { edit } of one of the app's, or { custom }: as JSON
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by INTEGER REFERENCES users (id) ON DELETE SET NULL
  );
  CREATE TABLE files (
    id TEXT PRIMARY KEY,
    mime TEXT NOT NULL,
    data BLOB NOT NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    created_by INTEGER REFERENCES users (id) ON DELETE SET NULL
  );
  `,
  // 4: what each account keeps (phase B): its labs, with a short history of
  // versions, and its settings (profile, preferences, practice's progress)
  `
  CREATE TABLE labs (
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    -- the topology document, as JSON
    document TEXT NOT NULL,
    size INTEGER NOT NULL,
    -- the browser's time of its last change (the newer one wins)
    updated_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
  );
  CREATE TABLE lab_versions (
    user_id INTEGER NOT NULL,
    lab_id TEXT NOT NULL,
    saved_at INTEGER NOT NULL,
    name TEXT NOT NULL,
    document TEXT NOT NULL,
    PRIMARY KEY (user_id, lab_id, saved_at),
    FOREIGN KEY (user_id, lab_id) REFERENCES labs (user_id, id) ON DELETE CASCADE
  );
  CREATE TABLE user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    -- { profile, prefs, practice }, as JSON
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
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
