"use client";

import { z } from "zod";
import { MAX_WORLD_PACK_BYTES, orderWorldPack, serializedWorldPackByteLength, worldPackSchema } from "@/lib/world-pack";

export const WORLD_LIBRARY_SCHEMA_VERSION = "world-library/v1" as const;
export const WORLD_LIBRARY_STORAGE_KEY = "misrule.world-library.v1";
export const MAX_LOCAL_WORLD_PACKS = 8;
export const MAX_WORLD_LIBRARY_BYTES = Math.floor(3.5 * 1024 * 1024);

const worldLibraryEntrySchema = z
  .object({
    pack: worldPackSchema,
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    lastOpenedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export const worldLibraryEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(WORLD_LIBRARY_SCHEMA_VERSION),
    entries: z.array(worldLibraryEntrySchema).max(MAX_LOCAL_WORLD_PACKS),
  })
  .strict()
  .superRefine((envelope, context) => {
    const seen = new Set<string>();
    envelope.entries.forEach((entry, index) => {
      if (seen.has(entry.pack.packId)) {
        context.addIssue({ code: "custom", path: ["entries", index, "pack", "packId"], message: "Duplicate World Pack ID in the library." });
      }
      seen.add(entry.pack.packId);
    });
  });

export type WorldLibraryEntry = z.infer<typeof worldLibraryEntrySchema>;
export type WorldLibraryEnvelope = z.infer<typeof worldLibraryEnvelopeSchema>;

export type WorldLibraryErrorCode =
  | "STORAGE_UNAVAILABLE"
  | "CORRUPTED_ENVELOPE"
  | "UNSUPPORTED_VERSION"
  | "INVALID_PACK"
  | "DUPLICATE_ID"
  | "PACK_TOO_LARGE"
  | "PACK_COUNT_LIMIT"
  | "LIBRARY_SIZE_LIMIT"
  | "QUOTA_EXCEEDED";

export class WorldLibraryError extends Error {
  constructor(readonly code: WorldLibraryErrorCode, message: string) {
    super(message);
  }
}

export interface WorldLibraryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SaveWorldPackOptions = {
  onConflict?: "error" | "replace";
  now?: () => string;
};

function browserStorage(): WorldLibraryStorage {
  try {
    if (typeof window === "undefined" || !window.localStorage) throw new Error("unavailable");
    return window.localStorage;
  } catch {
    throw new WorldLibraryError("STORAGE_UNAVAILABLE", "Browser-local storage is unavailable.");
  }
}

function resolveStorage(storage?: WorldLibraryStorage): WorldLibraryStorage {
  return storage ?? browserStorage();
}

function emptyEnvelope(): WorldLibraryEnvelope {
  return { schemaVersion: WORLD_LIBRARY_SCHEMA_VERSION, entries: [] };
}

function readEnvelope(storage?: WorldLibraryStorage): { envelope: WorldLibraryEnvelope; raw: string | null; storage: WorldLibraryStorage } {
  const resolved = resolveStorage(storage);
  let raw: string | null;
  try {
    raw = resolved.getItem(WORLD_LIBRARY_STORAGE_KEY);
  } catch {
    throw new WorldLibraryError("STORAGE_UNAVAILABLE", "Browser-local storage is unavailable.");
  }
  if (raw === null) return { envelope: emptyEnvelope(), raw, storage: resolved };
  if (new TextEncoder().encode(raw).byteLength > MAX_WORLD_LIBRARY_BYTES) {
    throw new WorldLibraryError("LIBRARY_SIZE_LIMIT", "The stored World Library exceeds the 3.5 MiB limit.");
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new WorldLibraryError("CORRUPTED_ENVELOPE", "The stored World Library is not valid JSON.");
  }
  if (typeof value === "object" && value !== null && "schemaVersion" in value && value.schemaVersion !== WORLD_LIBRARY_SCHEMA_VERSION) {
    throw new WorldLibraryError("UNSUPPORTED_VERSION", "The stored World Library version is not supported.");
  }
  const parsed = worldLibraryEnvelopeSchema.safeParse(value);
  if (!parsed.success) throw new WorldLibraryError("CORRUPTED_ENVELOPE", "The stored World Library failed validation.");
  if (parsed.data.entries.some((entry) => serializedWorldPackByteLength(entry.pack) > MAX_WORLD_PACK_BYTES)) {
    throw new WorldLibraryError("PACK_TOO_LARGE", "A stored World Pack exceeds the 768 KiB limit.");
  }
  return { envelope: parsed.data, raw, storage: resolved };
}

function orderedEntries(entries: WorldLibraryEntry[]): WorldLibraryEntry[] {
  return [...entries].sort((left, right) => left.pack.packId.localeCompare(right.pack.packId));
}

function writeEnvelope(storage: WorldLibraryStorage, envelope: WorldLibraryEnvelope): void {
  const validated = worldLibraryEnvelopeSchema.safeParse({ ...envelope, entries: orderedEntries(envelope.entries) });
  if (!validated.success) throw new WorldLibraryError("CORRUPTED_ENVELOPE", "The World Library write failed validation.");
  const serialized = JSON.stringify(validated.data);
  if (new TextEncoder().encode(serialized).byteLength > MAX_WORLD_LIBRARY_BYTES) {
    throw new WorldLibraryError("LIBRARY_SIZE_LIMIT", "The World Library exceeds the 3.5 MiB limit.");
  }
  try {
    storage.setItem(WORLD_LIBRARY_STORAGE_KEY, serialized);
  } catch (error) {
    if (typeof error === "object" && error !== null && "name" in error && error.name === "QuotaExceededError") {
      throw new WorldLibraryError("QUOTA_EXCEEDED", "The browser rejected the World Library write because its storage quota was exceeded.");
    }
    throw new WorldLibraryError("STORAGE_UNAVAILABLE", "Browser-local storage rejected the World Library write.");
  }
}

export function loadWorldLibrary(storage?: WorldLibraryStorage): WorldLibraryEnvelope {
  const { envelope } = readEnvelope(storage);
  return { ...envelope, entries: orderedEntries(envelope.entries) };
}

export function listLocalWorldPacks(storage?: WorldLibraryStorage): WorldLibraryEntry[] {
  return loadWorldLibrary(storage).entries;
}

export function getLocalWorldPack(packId: string, storage?: WorldLibraryStorage): WorldLibraryEntry | null {
  return loadWorldLibrary(storage).entries.find((entry) => entry.pack.packId === packId) ?? null;
}

export function saveLocalWorldPack(packValue: unknown, options: SaveWorldPackOptions = {}, storage?: WorldLibraryStorage): WorldLibraryEntry {
  const parsed = worldPackSchema.safeParse(packValue);
  if (!parsed.success) throw new WorldLibraryError("INVALID_PACK", "The World Pack failed validation.");
  const pack = orderWorldPack(parsed.data);
  if (serializedWorldPackByteLength(pack) > MAX_WORLD_PACK_BYTES) {
    throw new WorldLibraryError("PACK_TOO_LARGE", "The World Pack exceeds the 768 KiB limit.");
  }

  const { envelope, storage: resolved } = readEnvelope(storage);
  const existingIndex = envelope.entries.findIndex((entry) => entry.pack.packId === pack.packId);
  if (existingIndex >= 0 && options.onConflict !== "replace") {
    throw new WorldLibraryError("DUPLICATE_ID", "A local World Pack with this packId already exists.");
  }
  if (existingIndex < 0 && envelope.entries.length >= MAX_LOCAL_WORLD_PACKS) {
    throw new WorldLibraryError("PACK_COUNT_LIMIT", "The local World Library already contains eight World Packs.");
  }

  const now = (options.now ?? (() => new Date().toISOString()))();
  const entry: WorldLibraryEntry = {
    pack,
    createdAt: existingIndex >= 0 ? envelope.entries[existingIndex].createdAt : now,
    updatedAt: now,
    ...(existingIndex >= 0 && envelope.entries[existingIndex].lastOpenedAt
      ? { lastOpenedAt: envelope.entries[existingIndex].lastOpenedAt }
      : {}),
  };
  const entries = [...envelope.entries];
  if (existingIndex >= 0) entries[existingIndex] = entry;
  else entries.push(entry);
  writeEnvelope(resolved, { schemaVersion: WORLD_LIBRARY_SCHEMA_VERSION, entries });
  return entry;
}

export function deleteLocalWorldPack(packId: string, storage?: WorldLibraryStorage): boolean {
  const { envelope, storage: resolved } = readEnvelope(storage);
  const entries = envelope.entries.filter((entry) => entry.pack.packId !== packId);
  if (entries.length === envelope.entries.length) return false;
  writeEnvelope(resolved, { schemaVersion: WORLD_LIBRARY_SCHEMA_VERSION, entries });
  return true;
}
