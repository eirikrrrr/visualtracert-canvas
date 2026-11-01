// The accounts service: its API on PORT (8090 by default), its database in
// DATA_DIR, the emulator (which checks medium solves) at EMULATOR_URL. While there is no account, it prints the code that creating the
// first one (the admin) asks for: SETUP_CODE, or a random one.
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { Accounts } from "./accounts";
import { openDatabase } from "./db";
import { Practice } from "./practice";
import { providersFromEnv } from "./oauth";
import { emulatorVerifier, startServer } from "./server";

const db = openDatabase(join(process.env.DATA_DIR ?? "./data", "visual-tracert.db"));
const accounts = new Accounts(db);
const secure = process.env.COOKIE_SECURE;
const setupCode = (process.env.SETUP_CODE || randomBytes(4).toString("hex")).trim().toUpperCase();
if(accounts.needsSetup()) console.log(`No accounts yet. Create the admin at the web with this setup code: ${setupCode}`);

const server = startServer(accounts, new Practice(db), Number(process.env.PORT) || 8090, {
  verify: emulatorVerifier(process.env.EMULATOR_URL ?? "http://127.0.0.1:9151"),
  oauth: { providers: providersFromEnv(), publicUrl: process.env.PUBLIC_URL || undefined },
  secureCookies: secure === "1" ? "always" : secure === "0" ? "never" : "auto",
  setupCode,
});
for(const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
