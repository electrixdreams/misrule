import { describe, expect, it } from "vitest";
import ashglass from "@/fixtures/ashglass-clocktower-v1/input.json";
import portable from "@/tests/fixtures/portable-two-book-world-pack.json";
import { worldPackSchema } from "@/lib/world-pack";

describe("world-pack/v1 contract", () => {
  const ashglassPack = worldPackSchema.parse(ashglass);
  const portablePack = worldPackSchema.parse(portable);

  it("preserves the corrected C2 premise, IDs, counts, and ordering", () => {
    expect(ashglassPack.schemaVersion).toBe("world-pack/v1");
    expect(ashglassPack.packId).toBe("ashglass-clocktower-v1");
    expect(ashglassPack.world.premise).toContain("Oracle Nera’s visions are usually possibilities, though a rare star-marked vision is fixed.");
    expect(ashglassPack.rules).toHaveLength(10);
    expect(ashglassPack.spans).toHaveLength(18);
    expect(ashglassPack.rules.map((rule) => rule.ruleId)).toEqual(Array.from({ length: 10 }, (_, index) => `RG-R${String(index + 1).padStart(2, "0")}`));
    expect(ashglassPack.spans.map((span) => span.spanId)).toEqual(Array.from({ length: 18 }, (_, index) => `RG-S${String(index + 1).padStart(2, "0")}`));
  });

  it("strictly rejects unknown fields, ground truth, and unsupported versions", () => {
    expect(worldPackSchema.safeParse({ ...portablePack, surprise: true }).success).toBe(false);
    expect(worldPackSchema.safeParse({ ...portablePack, groundTruth: [] }).success).toBe(false);
    expect(worldPackSchema.safeParse({ ...portablePack, expectedCases: [] }).success).toBe(false);
    expect(worldPackSchema.safeParse({ ...portablePack, schemaVersion: "world-pack/v2" }).success).toBe(false);
  });

  it.each([
    ["book IDs", (pack: typeof portablePack) => ({ ...pack, books: [pack.books[0], { ...pack.books[0], ordinal: 9 }] })],
    ["rule IDs", (pack: typeof portablePack) => ({ ...pack, rules: [pack.rules[0], { ...pack.rules[0], displayOrder: 9 }] })],
    ["span IDs", (pack: typeof portablePack) => ({ ...pack, spans: [pack.spans[0], { ...pack.spans[0], displayOrder: 9 }] })],
    ["book ordinals", (pack: typeof portablePack) => ({ ...pack, books: [pack.books[0], { ...pack.books[1], ordinal: pack.books[0].ordinal }] })],
    ["rule display orders", (pack: typeof portablePack) => ({ ...pack, rules: [pack.rules[0], { ...pack.rules[1], displayOrder: pack.rules[0].displayOrder }] })],
    ["span display orders", (pack: typeof portablePack) => ({ ...pack, spans: [pack.spans[0], { ...pack.spans[1], displayOrder: pack.spans[0].displayOrder }] })],
  ])("rejects duplicate %s", (_name, mutate) => {
    expect(worldPackSchema.safeParse(mutate(portablePack)).success).toBe(false);
  });

  it("rejects invalid world, book, scope, and span relationships", () => {
    expect(worldPackSchema.safeParse({ ...portablePack, books: [{ ...portablePack.books[0], worldId: "other" }, portablePack.books[1]] }).success).toBe(false);
    expect(worldPackSchema.safeParse({ ...portablePack, rules: [{ ...portablePack.rules[0], worldId: "other" }, portablePack.rules[1]] }).success).toBe(false);
    expect(worldPackSchema.safeParse({ ...portablePack, rules: [portablePack.rules[0], { ...portablePack.rules[1], scope: { kind: "book", bookId: "missing" } }] }).success).toBe(false);
    expect(worldPackSchema.safeParse({ ...portablePack, spans: [{ ...portablePack.spans[0], worldId: "other" }, portablePack.spans[1]] }).success).toBe(false);
    expect(worldPackSchema.safeParse({ ...portablePack, spans: [{ ...portablePack.spans[0], bookId: "missing" }, portablePack.spans[1]] }).success).toBe(false);
  });
});
