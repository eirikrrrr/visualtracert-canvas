// The emulator service: its API on PORT (8080 by default), the sweep that
// stops the labs whose time is up, and its lab image (LAB_PROFILE), built once
// in the background if it is not there: until then, Alpine devices run as
// plain Alpine (without bridge, dnsmasq or httpd).
import { LAB_PROFILE } from "@visual-tracert/model";
import { sweepExpired } from "./lab";
import { buildProfile, profileStatus } from "./profiles";
import { startServer } from "./server";

const server = startServer(Number(process.env.PORT) || 8080);
sweepExpired();
void (async () => {
  try{
    if((await profileStatus(LAB_PROFILE)).state === "built") return;
    console.log(`building the lab image (${LAB_PROFILE.packages.join(", ")})…`);
    const { ok, log } = await buildProfile(LAB_PROFILE);
    console.log(ok ? "lab image built" : `the lab image could not be built:\n${log.slice(-2000)}`);
  }catch(error){
    console.error("the lab image could not be built:", (error as Error).message);
  }
})();
for(const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close(() => process.exit(0)));
