import "server-only";

import ashglassInput from "@/fixtures/ashglass-clocktower-v1/input.json";
import { worldPackCatalog } from "@/fixtures/catalog.server";
import { worldPackSchema, type WorldPack } from "@/lib/world-pack";

export class WorldPackRepositoryError extends Error {
  constructor(
    readonly code: "WORLD_PACK_NOT_FOUND" | "WORLD_PACK_INVALID",
    message: string,
  ) {
    super(message);
  }
}

export function listBundledWorldPacks() {
  return worldPackCatalog.map((entry) => ({ ...entry, bookIds: [...entry.bookIds] }));
}

const bundledInputs: Record<string, unknown> = {
  "ashglass-clocktower-v1": ashglassInput,
};

export function loadBundledWorldPack(packId: string): WorldPack {
  const input = bundledInputs[packId];
  if (!input || !worldPackCatalog.some((entry) => entry.enabled && entry.packId === packId)) {
    throw new WorldPackRepositoryError("WORLD_PACK_NOT_FOUND", "The requested bundled World Pack is not mounted.");
  }

  const parsed = worldPackSchema.safeParse(input);
  if (!parsed.success) {
    throw new WorldPackRepositoryError("WORLD_PACK_INVALID", "The mounted World Pack failed validation.");
  }
  return parsed.data;
}
