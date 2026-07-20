import { describe, expect, it } from "vitest";
import portable from "@/tests/fixtures/portable-two-book-world-pack.json";
import {
  WORLD_LIBRARY_STORAGE_KEY,
  deleteLocalWorldPack,
  getLocalWorldPack,
  listLocalWorldPacks,
  loadWorldLibrary,
  resetLocalWorldLibrary,
  saveLocalWorldPack,
  type WorldLibraryStorage,
} from "@/lib/world-library.client";
import { worldPackSchema, type WorldPack } from "@/lib/world-pack";

class MemoryStorage implements WorldLibraryStorage {
  value: string | null = null;
  failWithQuota = false;

  getItem(key: string) {
    void key;
    return this.value;
  }

  setItem(_key: string, value: string) {
    if (this.failWithQuota) throw Object.assign(new Error("quota"), { name: "QuotaExceededError" });
    this.value = value;
  }

  removeItem(key: string) {
    void key;
    this.value = null;
  }
}

const basePack = worldPackSchema.parse(portable);

function withId(index: number): WorldPack {
  return { ...basePack, packId: `portable-${index}`, title: `Portable ${index}` };
}

function sizedPack(index: number, spanCount: number): WorldPack {
  return worldPackSchema.parse({
    ...withId(index),
    spans: Array.from({ length: spanCount }, (_, spanIndex) => ({
      ...basePack.spans[spanIndex % basePack.spans.length],
      spanId: `NOTE-${index}-${spanIndex}`,
      displayOrder: spanIndex,
      text: "x".repeat(4_000),
    })),
  });
}

describe("bounded browser-local World Library", () => {
  it("loads empty and performs deterministic save/list/get/delete operations", () => {
    const storage = new MemoryStorage();
    expect(loadWorldLibrary(storage)).toEqual({ schemaVersion: "world-library/v1", entries: [] });
    saveLocalWorldPack(withId(2), { now: () => "2026-07-20T01:00:00.000Z" }, storage);
    saveLocalWorldPack(withId(1), { now: () => "2026-07-20T02:00:00.000Z" }, storage);
    expect(listLocalWorldPacks(storage).map((entry) => entry.pack.packId)).toEqual(["portable-1", "portable-2"]);
    expect(getLocalWorldPack("portable-2", storage)?.createdAt).toBe("2026-07-20T01:00:00.000Z");
    expect(deleteLocalWorldPack("portable-2", storage)).toBe(true);
    expect(deleteLocalWorldPack("portable-2", storage)).toBe(false);
  });

  it("requires explicit replacement for a duplicate packId", () => {
    const storage = new MemoryStorage();
    saveLocalWorldPack(basePack, { now: () => "2026-07-20T01:00:00.000Z" }, storage);
    expect(() => saveLocalWorldPack(basePack, {}, storage)).toThrow(expect.objectContaining({ code: "DUPLICATE_ID" }));
    const replacement = saveLocalWorldPack(
      { ...basePack, title: "Revised" },
      { onConflict: "replace", now: () => "2026-07-20T02:00:00.000Z" },
      storage,
    );
    expect(replacement).toMatchObject({ createdAt: "2026-07-20T01:00:00.000Z", updatedAt: "2026-07-20T02:00:00.000Z", pack: { title: "Revised" } });
  });

  it("surfaces corrupted and unsupported envelopes without deleting them", () => {
    const corrupted = new MemoryStorage();
    corrupted.value = "{broken";
    expect(() => loadWorldLibrary(corrupted)).toThrow(expect.objectContaining({ code: "CORRUPTED_ENVELOPE" }));
    expect(corrupted.value).toBe("{broken");

    const unsupported = new MemoryStorage();
    unsupported.value = JSON.stringify({ schemaVersion: "world-library/v2", entries: [] });
    expect(() => loadWorldLibrary(unsupported)).toThrow(expect.objectContaining({ code: "UNSUPPORTED_VERSION" }));
    expect(unsupported.value).toContain("world-library/v2");
  });

  it("surfaces unavailable storage and oversized stored packs as typed failures", () => {
    const unavailable: WorldLibraryStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(() => loadWorldLibrary(unavailable)).toThrow(expect.objectContaining({ code: "STORAGE_UNAVAILABLE" }));

    const oversized = new MemoryStorage();
    oversized.value = JSON.stringify({
      schemaVersion: "world-library/v1",
      entries: [{ pack: sizedPack(99, 200), createdAt: "2026-07-20T01:00:00.000Z", updatedAt: "2026-07-20T01:00:00.000Z" }],
    });
    expect(() => loadWorldLibrary(oversized)).toThrow(expect.objectContaining({ code: "PACK_TOO_LARGE" }));
  });

  it("types invalid packs, per-pack limits, count limits, and total-library limits", () => {
    const storage = new MemoryStorage();
    expect(() => saveLocalWorldPack({ ...basePack, runtime: { apiKey: "secret" } }, {}, storage)).toThrow(expect.objectContaining({ code: "INVALID_PACK" }));
    expect(() => saveLocalWorldPack(sizedPack(99, 200), {}, storage)).toThrow(expect.objectContaining({ code: "PACK_TOO_LARGE" }));

    for (let index = 0; index < 8; index += 1) saveLocalWorldPack(withId(index), {}, storage);
    expect(() => saveLocalWorldPack(withId(8), {}, storage)).toThrow(expect.objectContaining({ code: "PACK_COUNT_LIMIT" }));

    const totalStorage = new MemoryStorage();
    for (let index = 0; index < 7; index += 1) saveLocalWorldPack(sizedPack(index, 120), {}, totalStorage);
    expect(() => saveLocalWorldPack(sizedPack(7, 120), {}, totalStorage)).toThrow(expect.objectContaining({ code: "LIBRARY_SIZE_LIMIT" }));
  });

  it("types quota failures and preserves the prior valid envelope", () => {
    const storage = new MemoryStorage();
    saveLocalWorldPack(basePack, {}, storage);
    const before = storage.value;
    storage.failWithQuota = true;
    expect(() => saveLocalWorldPack({ ...basePack, title: "Changed" }, { onConflict: "replace" }, storage)).toThrow(expect.objectContaining({ code: "QUOTA_EXCEEDED" }));
    expect(storage.value).toBe(before);
  });

  it("persists no runtime, key, raw-output, evidence, or bundled Ashglass metadata", () => {
    const storage = new MemoryStorage();
    saveLocalWorldPack(basePack, {}, storage);
    expect(storage.value).not.toContain("apiKey");
    expect(storage.value).not.toContain("runtime");
    expect(storage.value).not.toContain("rawResponse");
    expect(storage.value).not.toContain("audit");
    expect(storage.value).not.toContain("ashglass-clocktower-v1");
    expect(storage.getItem(WORLD_LIBRARY_STORAGE_KEY)).toBe(storage.value);
  });
});

describe("resetLocalWorldLibrary", () => {
  class KeyedStorage implements WorldLibraryStorage {
    map = new Map<string, string>();
    getItem(key: string) {
      return this.map.has(key) ? this.map.get(key)! : null;
    }
    setItem(key: string, value: string) {
      this.map.set(key, value);
    }
    removeItem(key: string) {
      this.map.delete(key);
    }
  }

  it("removes only the World Library storage key and leaves other keys intact", () => {
    const storage = new KeyedStorage();
    saveLocalWorldPack(basePack, { now: () => "2026-07-20T01:00:00.000Z" }, storage);
    storage.setItem("misrule.other", "keep");
    resetLocalWorldLibrary(storage);
    expect(storage.getItem(WORLD_LIBRARY_STORAGE_KEY)).toBeNull();
    expect(storage.getItem("misrule.other")).toBe("keep");
    expect(loadWorldLibrary(storage)).toEqual({ schemaVersion: "world-library/v1", entries: [] });
  });

  it("throws STORAGE_UNAVAILABLE through the existing storage boundary", () => {
    const blocked: WorldLibraryStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(() => resetLocalWorldLibrary(blocked)).toThrow(expect.objectContaining({ code: "STORAGE_UNAVAILABLE" }));
  });

  it("reloads an empty library after a corrupted envelope is reset", () => {
    const storage = new MemoryStorage();
    storage.value = "{broken";
    expect(() => loadWorldLibrary(storage)).toThrow(expect.objectContaining({ code: "CORRUPTED_ENVELOPE" }));
    resetLocalWorldLibrary(storage);
    expect(() => loadWorldLibrary(storage)).not.toThrow();
    expect(loadWorldLibrary(storage).entries).toHaveLength(0);
  });
});
