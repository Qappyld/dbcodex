import { describe, expect, it } from "vitest";
import { hashDocument } from "../src/document-hash.js";

describe("hashDocument", () => {
  it("returns a stable sha256 digest and changes with the source", () => {
    const first = hashDocument("Table users { id int [pk] }");
    const second = hashDocument("Table users { id uuid [pk] }");

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(hashDocument("Table users { id int [pk] }"));
    expect(second).not.toBe(first);
  });
});
