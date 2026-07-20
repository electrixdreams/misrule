import {
  MAX_WORLD_PACK_BYTES,
  WORLD_PACK_SCHEMA_VERSION,
  orderWorldPack,
  serializedWorldPackByteLength,
  utf8ByteLength,
  worldPackSchema,
  type WorldPack,
} from "@/lib/world-pack";

export type WorldPackImportIssue = {
  code: string;
  path: string;
  message: string;
};

export type WorldPackImportResult =
  | { ok: true; pack: WorldPack }
  | {
      ok: false;
      code: "MALFORMED_JSON" | "UNSUPPORTED_SCHEMA_VERSION" | "INVALID_WORLD_PACK" | "WORLD_PACK_TOO_LARGE";
      issues: WorldPackImportIssue[];
    };

export class WorldPackIoError extends Error {
  constructor(
    readonly code: "INVALID_WORLD_PACK" | "WORLD_PACK_TOO_LARGE",
    message: string,
  ) {
    super(message);
  }
}

export function parseWorldPackJson(text: string): WorldPackImportResult {
  if (utf8ByteLength(text) > MAX_WORLD_PACK_BYTES) {
    return {
      ok: false,
      code: "WORLD_PACK_TOO_LARGE",
      issues: [{ code: "too_big", path: "$", message: "The World Pack exceeds the 768 KiB import limit." }],
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {
      ok: false,
      code: "MALFORMED_JSON",
      issues: [{ code: "invalid_json", path: "$", message: "The selected text is not valid JSON." }],
    };
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    value.schemaVersion !== WORLD_PACK_SCHEMA_VERSION
  ) {
    return {
      ok: false,
      code: "UNSUPPORTED_SCHEMA_VERSION",
      issues: [{ code: "unsupported_version", path: "schemaVersion", message: "Only world-pack/v1 is supported." }],
    };
  }

  const parsed = worldPackSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_WORLD_PACK",
      issues: parsed.error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path.length ? issue.path.join(".") : "$",
        message: issue.message,
      })),
    };
  }

  const pack = orderWorldPack(parsed.data);
  if (serializedWorldPackByteLength(pack) > MAX_WORLD_PACK_BYTES) {
    return {
      ok: false,
      code: "WORLD_PACK_TOO_LARGE",
      issues: [{ code: "too_big", path: "$", message: "The World Pack exceeds the 768 KiB import limit." }],
    };
  }
  return { ok: true, pack };
}

export function exportWorldPackJson(value: unknown): string {
  const parsed = worldPackSchema.safeParse(value);
  if (!parsed.success) throw new WorldPackIoError("INVALID_WORLD_PACK", "Only a valid world-pack/v1 value can be exported.");
  const pack = orderWorldPack(parsed.data);
  if (serializedWorldPackByteLength(pack) > MAX_WORLD_PACK_BYTES) {
    throw new WorldPackIoError("WORLD_PACK_TOO_LARGE", "The World Pack exceeds the 768 KiB export limit.");
  }
  const serialized = `${JSON.stringify(pack, null, 2)}\n`;
  if (utf8ByteLength(serialized) > MAX_WORLD_PACK_BYTES) {
    throw new WorldPackIoError("WORLD_PACK_TOO_LARGE", "The exported World Pack exceeds the 768 KiB limit.");
  }
  return serialized;
}

export function suggestWorldPackFilename(pack: WorldPack): string {
  const slug = pack.world.slug
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "world-pack";
  return `${slug}.misrule-world.json`;
}
