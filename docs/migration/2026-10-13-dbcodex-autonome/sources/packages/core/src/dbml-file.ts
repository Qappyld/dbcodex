import { open } from "node:fs/promises";
import { assertByteLength, DBCD_MAX_SOURCE_BYTES } from "./dbcd-resource-limits.js";

/** Read only after resolving a workspace-confined DBML path. */
export async function readBoundedDbmlFile(absolutePath: string): Promise<string> {
  const handle = await open(absolutePath, "r");
  try {
    const size = (await handle.stat()).size;
    assertByteLength(size, DBCD_MAX_SOURCE_BYTES);
    // One extra byte detects concurrent growth, with a fixed upper allocation bound.
    const bytes = Buffer.alloc(size + 1);
    let used = 0;
    while (used < bytes.length) {
      const read = await handle.read(bytes, used, bytes.length - used, used);
      if (read.bytesRead === 0) break;
      used += read.bytesRead;
    }
    assertByteLength(used, size);
    return bytes.subarray(0, used).toString("utf8");
  } finally { await handle.close(); }
}
