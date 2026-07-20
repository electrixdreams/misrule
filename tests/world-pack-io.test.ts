import { describe, expect, it } from "vitest";
import portable from "@/tests/fixtures/portable-two-book-world-pack.json";
import { exportWorldPackJson, parseWorldPackJson, suggestWorldPackFilename } from "@/lib/world-pack-io";
import { worldPackSchema } from "@/lib/world-pack";

describe("World Pack JSON import and export", () => {
  const pack = worldPackSchema.parse(portable);

  it("parses valid JSON and reports malformed JSON without repair", () => {
    expect(parseWorldPackJson(JSON.stringify(pack))).toEqual({ ok: true, pack });
    expect(parseWorldPackJson("{not json")).toMatchObject({ ok: false, code: "MALFORMED_JSON", issues: [{ path: "$" }] });
  });

  it("reports unsupported versions and actionable relational issues", () => {
    expect(parseWorldPackJson(JSON.stringify({ ...pack, schemaVersion: "world-pack/v9" }))).toMatchObject({ ok: false, code: "UNSUPPORTED_SCHEMA_VERSION" });
    const invalid = { ...pack, spans: [{ ...pack.spans[0], bookId: "missing-book" }, pack.spans[1]] };
    const result = parseWorldPackJson(JSON.stringify(invalid));
    expect(result).toMatchObject({ ok: false, code: "INVALID_WORLD_PACK" });
    if (!result.ok) expect(result.issues.some((issue) => issue.path.includes("bookId") && issue.message.includes("unknown book"))).toBe(true);
  });

  it("rejects oversized JSON text before parsing or persistence", () => {
    expect(parseWorldPackJson(`{"padding":"${"x".repeat(768 * 1024)}"}`)).toMatchObject({ ok: false, code: "WORLD_PACK_TOO_LARGE" });
  });

  it("round-trips without semantic loss and exports only the portable pack", () => {
    const exported = exportWorldPackJson(pack);
    const reparsed = parseWorldPackJson(exported);
    expect(reparsed).toEqual({ ok: true, pack });
    expect(exported).not.toContain("createdAt");
    expect(exported).not.toContain("runtime");
    expect(exported).not.toContain("groundTruth");
    expect(exported).not.toContain("rawResponse");
  });

  it("suggests a safe deterministic filename", () => {
    expect(suggestWorldPackFilename({ ...pack, world: { ...pack.world, slug: "Harbor / Hours!?" } })).toBe("harbor-hours.misrule-world.json");
  });
});
