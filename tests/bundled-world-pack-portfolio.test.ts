import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ashglassInput from "@/fixtures/ashglass-clocktower-v1/input.json";
import blackwaterGroundTruth from "@/fixtures/blackwater-testament-v1/ground-truth.server.json";
import blackwaterInput from "@/fixtures/blackwater-testament-v1/input.json";
import { worldPackCatalog } from "@/fixtures/catalog.server";
import neonGroundTruth from "@/fixtures/neon-reliquary-v1/ground-truth.server.json";
import neonInput from "@/fixtures/neon-reliquary-v1/input.json";
import starfallGroundTruth from "@/fixtures/starfall-accord-v1/ground-truth.server.json";
import starfallInput from "@/fixtures/starfall-accord-v1/input.json";
import verdantGroundTruth from "@/fixtures/verdant-circuit-v1/ground-truth.server.json";
import verdantInput from "@/fixtures/verdant-circuit-v1/input.json";
import { loadBundledWorldPack } from "@/lib/world-pack-catalog.server";
import { MAX_WORLD_PACK_BYTES, serializedWorldPackByteLength, worldPackSchema, type WorldPack } from "@/lib/world-pack";

const expectedPackIds = [
  "ashglass-clocktower-v1",
  "neon-reliquary-v1",
  "blackwater-testament-v1",
  "starfall-accord-v1",
  "verdant-circuit-v1",
] as const;

const bundledInputs = [ashglassInput, neonInput, blackwaterInput, starfallInput, verdantInput];
const packs = bundledInputs.map((input) => worldPackSchema.parse(input));

type GroundTruthCase = {
  caseId: string;
  expected: "contradiction" | "ambiguity" | "none";
  ruleIds: string[];
  spanIds: string[];
  missingFact?: string | null;
};

type GroundTruth = {
  schemaVersion: string;
  fixtureId: string;
  fixtureVersion: string;
  cases: GroundTruthCase[];
};

const newGroundTruthByPackId = new Map<string, GroundTruth>([
  ["neon-reliquary-v1", neonGroundTruth as GroundTruth],
  ["blackwater-testament-v1", blackwaterGroundTruth as GroundTruth],
  ["starfall-accord-v1", starfallGroundTruth as GroundTruth],
  ["verdant-circuit-v1", verdantGroundTruth as GroundTruth],
]);

function expectUnique(values: string[]) {
  expect(new Set(values).size).toBe(values.length);
}

function clientSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return clientSourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("bundled World Pack portfolio", () => {
  it("parses every input and keeps every serialized pack below the byte limit", () => {
    expect(packs).toHaveLength(5);
    for (const pack of packs) {
      expect(serializedWorldPackByteLength(pack)).toBeLessThan(MAX_WORLD_PACK_BYTES);
    }
  });

  it("publishes exactly the five enabled catalog entries in locked order", () => {
    expect(worldPackCatalog).toHaveLength(5);
    expect(worldPackCatalog.every((entry) => entry.enabled)).toBe(true);
    expect(worldPackCatalog.map((entry) => entry.packId)).toEqual(expectedPackIds);
  });

  it("loads every catalog entry and keeps catalog metadata aligned with the pack", () => {
    for (const entry of worldPackCatalog) {
      const pack = loadBundledWorldPack(entry.packId);
      expect({
        packId: entry.packId,
        packVersion: entry.packVersion,
        worldId: entry.worldId,
        title: entry.title,
        bookIds: entry.bookIds,
      }).toEqual({
        packId: pack.packId,
        packVersion: pack.packVersion,
        worldId: pack.world.worldId,
        title: pack.title,
        bookIds: [...pack.books].sort((left, right) => left.ordinal - right.ordinal).map((book) => book.bookId),
      });
    }
  });

  it("keeps portfolio identifiers unique across bundled packs", () => {
    expectUnique(packs.map((pack) => pack.packId));
    expectUnique(packs.map((pack) => pack.world.worldId));
    expectUnique(packs.flatMap((pack) => pack.books.map((book) => book.bookId)));
    expectUnique(packs.flatMap((pack) => pack.rules.map((rule) => rule.ruleId)));
    expectUnique(packs.flatMap((pack) => pack.spans.map((span) => span.spanId)));
  });

  it("keeps each new ground-truth file aligned, closed, and referentially valid", () => {
    for (const pack of packs.slice(1) as WorldPack[]) {
      const groundTruth = newGroundTruthByPackId.get(pack.packId);
      expect(groundTruth).toBeDefined();
      if (!groundTruth) continue;

      expect(groundTruth.schemaVersion).toBe("ground-truth/v1");
      expect(groundTruth.fixtureId).toBe(pack.packId);
      expect(groundTruth.fixtureVersion).toBe(pack.packVersion);
      expectUnique(groundTruth.cases.map((testCase) => testCase.caseId));

      const ruleIds = new Set(pack.rules.map((rule) => rule.ruleId));
      const spanIds = new Set(pack.spans.map((span) => span.spanId));
      for (const testCase of groundTruth.cases) {
        expect(["contradiction", "ambiguity", "none"]).toContain(testCase.expected);
        expect(testCase.ruleIds.every((ruleId) => ruleIds.has(ruleId))).toBe(true);
        expect(testCase.spanIds.every((spanId) => spanIds.has(spanId))).toBe(true);
        if (testCase.expected === "ambiguity") {
          expect(testCase.missingFact?.startsWith("Whether ")).toBe(true);
        } else {
          expect(testCase.missingFact ?? null).toBeNull();
        }
      }
      expect(groundTruth.cases.filter((testCase) => testCase.expected === "none").length).toBeGreaterThanOrEqual(2);
    }
  });

  it("does not import server-only ground truth from a client component", () => {
    const sourceFiles = [join(process.cwd(), "app"), join(process.cwd(), "components")].flatMap(clientSourceFiles);
    const offendingFiles = sourceFiles.filter((path) => {
      const source = readFileSync(path, "utf8");
      return /^\s*["']use client["'];/m.test(source) && source.includes("ground-truth.server");
    });
    expect(offendingFiles).toEqual([]);
  });
});
