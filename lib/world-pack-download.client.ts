"use client";

import { exportWorldPackJson, suggestWorldPackFilename, WorldPackIoError } from "@/lib/world-pack-io";
import type { WorldPack } from "@/lib/world-pack";

export class WorldPackDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorldPackDownloadError";
  }
}

export function downloadWorldPack(pack: WorldPack): void {
  let serialized: string;
  try {
    serialized = exportWorldPackJson(pack);
  } catch (error) {
    if (error instanceof WorldPackIoError) {
      throw new WorldPackDownloadError("The World Pack could not be exported as portable JSON.");
    }
    throw error;
  }

  const filename = suggestWorldPackFilename(pack);
  const blob = new Blob([serialized], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
