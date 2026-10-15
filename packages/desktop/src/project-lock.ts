import { createServer, type Server } from "node:net";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
// Windows named pipes are local to this computer and released by the OS after a crash.
export async function acquireProjectLock(path: string): Promise<Server | null> {
  const key = createHash("sha256").update(realpathSync(path).toLowerCase()).digest("hex");
  return new Promise((resolve) => {
    const server = createServer(socket => socket.end());
    server.once("error", () => resolve(null));
    server.listen(`\\\\.\\pipe\\dbcodex-${key}`, () => resolve(server));
  });
}
