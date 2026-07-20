"use client";

import { useState } from "react";
import type { PublicRuntimeDefaults } from "@/lib/contracts";
import type { WorldPack } from "@/lib/world-pack";
import { MisruleApp } from "@/components/MisruleApp";
import { WorldLibrary } from "@/components/world-library/WorldLibrary";
import { WorldPackEditor } from "@/components/world-pack-editor/WorldPackEditor";

type ProductView =
  | { kind: "library" }
  | { kind: "clockwork"; packId: string }
  | { kind: "editor"; mode: "create" | "edit"; packId?: string };

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

  if (view.kind === "editor") {
    return (
      <WorldPackEditor
        mode={view.mode}
        packId={view.packId}
        onReturnToLibrary={() => setView({ kind: "library" })}
      />
    );
  }

  return (
    <WorldLibrary
      bundledPacks={bundledPacks}
      onOpenBundled={(packId) => setView({ kind: "clockwork", packId })}
      onCreatePack={() => setView({ kind: "editor", mode: "create" })}
      onEditPack={(packId) => setView({ kind: "editor", mode: "edit", packId })}
    />
  );
}
