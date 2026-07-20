"use client";

import { useState } from "react";
import type { PublicRuntimeDefaults } from "@/lib/contracts";
import type { WorldPack } from "@/lib/world-pack";
import { MisruleApp } from "@/components/MisruleApp";
import { WorldLibrary } from "@/components/world-library/WorldLibrary";

type ProductView =
  | { kind: "library" }
  | { kind: "clockwork"; packId: string };

export function MisruleProduct({
  bundledPacks,
  runtimeDefaults,
  auditMode = "live",
}: {
  bundledPacks: WorldPack[];
  runtimeDefaults?: PublicRuntimeDefaults;
  auditMode?: "live" | "mock";
}) {
  const [view, setView] = useState<ProductView>({ kind: "library" });

  if (view.kind === "clockwork") {
    const pack = bundledPacks.find((candidate) => candidate.packId === view.packId) ?? bundledPacks[0];
    return (
      <MisruleApp
        pack={pack}
        runtimeDefaults={runtimeDefaults}
        auditMode={auditMode}
        onReturnToLibrary={() => setView({ kind: "library" })}
      />
    );
  }

  return (
    <WorldLibrary
      bundledPacks={bundledPacks}
      onOpenBundled={(packId) => setView({ kind: "clockwork", packId })}
    />
  );
}
