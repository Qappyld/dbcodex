/** Byte limits apply independently to each source, presentation and compressed snapshot. */
export const DBCD_MAX_SOURCE_BYTES = 4 * 1024 * 1024;
export const DBCD_MAX_PRESENTATION_BYTES = 4 * 1024 * 1024;
export const DBCD_MAX_COMPRESSED_BYTES = 4 * 1024 * 1024;

export class DbcdResourceLimitError extends Error {
  readonly code = "RESOURCE_LIMIT";
  constructor() { super("The project payload exceeds its size limit."); this.name = "DbcdResourceLimitError"; }
}

export function assertByteLength(length: number, limit: number): void {
  if (!Number.isSafeInteger(length) || length < 0 || length > limit) throw new DbcdResourceLimitError();
}

/** Counts UTF-8 without first allocating an encoded copy; also runs in the browser. */
export function boundedUtf8Length(value: string, limit: number): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes++;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length
      && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) { bytes += 4; index++; }
    else bytes += 3;
    if (bytes > limit) throw new DbcdResourceLimitError();
  }
  return bytes;
}

/** Bounds the JSON representation before the schema clones or sorts the object. */
export function assertJsonByteLimit(value: unknown, limit: number): void {
  let bytes = 0;
  const ancestors = new Set<object>();
  const add = (length: number) => { bytes += length; assertByteLength(bytes, limit); };
  const string = (text: string) => {
    boundedUtf8Length(text, limit - bytes);
    add(boundedUtf8Length(JSON.stringify(text), limit - bytes));
  };
  const visit = (item: unknown, depth: number): void => {
    if (depth > 32) throw new DbcdResourceLimitError();
    if (typeof item === "string") { string(item); return; }
    if (item === null || typeof item !== "object") { add(JSON.stringify(item)?.length ?? 4); return; }
    if (ancestors.has(item)) throw new DbcdResourceLimitError();
    ancestors.add(item);
    add(2);
    let count = 0;
    if (Array.isArray(item)) {
      for (const child of item) { if (count++ > 0) add(1); visit(child, depth + 1); }
    } else {
      for (const key in item) {
        if (!Object.hasOwn(item, key)) continue;
        if (count++ > 0) add(1);
        string(key); add(1); visit((item as Record<string, unknown>)[key], depth + 1);
      }
    }
    ancestors.delete(item);
  };
  visit(value, 0);
}
