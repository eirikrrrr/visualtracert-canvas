// The emulator service: its API on PORT (8080 by default).
import { startServer } from "./server";

const server = startServer(Number(process.env.PORT) || 8080);
for(const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close(() => process.exit(0)));
