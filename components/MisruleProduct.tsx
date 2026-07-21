"use client";

import { useState } from "react";
import type { AuditWorldPackSource, PublicRuntimeDefaults } from "@/lib/contracts";
import type { WorldPack } from "@/lib/world-pack";
import { WorldLibraryError, getLocalWorldPack } from "@/lib/world-library.client";
import { MisruleApp } from "@/components/MisruleApp";
import { WorldLibrary } from "@/components/world-library/WorldLibrary";
import { WorldPackEditor } from "@/components/world-pack-editor/WorldPackEditor";

type ProductView =
  | { kind: "library" }
  | { kind: "clockwork"; source: { kind: "bundled"; packId: string } | { kind: "local"; packId: string } }
  | { kind: "editor"; mode: "create" | "edit"; packId?: string };

function ProductLoadError({
  title,
  message,
  onReturnToLibrary,
}: {
  title: string;
  message: string;
  onReturnToLibrary: () => void;
}) {
  return (
    <main className="world-library">
      <section className="library-section library-error" role="alert">
        <p className="library-error-title">{title}</p>
        <p>{message}</p>
        <button type="button" onClick={onReturnToLibrary}>Return to World Library</button>
      </section>
    </main>
  );
}

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
  // Tracks which packs have already had their entry gate dismissed this
  // session, so re-opening a pack you've already entered skips the threshold
  // modal. MisruleApp remounts fresh every time a pack is (re)opened from the
  // library, so this can't live in MisruleApp's own state — it has to persist
  // in this parent, which never unmounts across view switches.
  const [enteredPackKeys, setEnteredPackKeys] = useState<Set<string>>(() => new Set());

  if (view.kind === "clockwork") {
    let pack: WorldPack | null = null;
    let source: AuditWorldPackSource | null = null;
    if (view.source.kind === "bundled") {
      pack = bundledPacks.find((candidate) => candidate.packId === view.source.packId) ?? null;
      if (!pack) {
        return (
          <ProductLoadError
            title="Bundled World Pack unavailable"
            message="The selected bundled World Pack could not be opened."
            onReturnToLibrary={() => setView({ kind: "library" })}
          />
        );
      }
      source = { kind: "bundled", packId: pack.packId };
    } else {
      try {
        const entry = getLocalWorldPack(view.source.packId);
        if (entry) {
          pack = entry.pack;
          source = { kind: "inline", pack: entry.pack };
        }
      } catch (error) {
        return (
          <ProductLoadError
            title="Local World Pack unavailable"
            message={error instanceof WorldLibraryError ? error.message : "Browser-local storage could not be read."}
            onReturnToLibrary={() => setView({ kind: "library" })}
          />
        );
      }
      if (!pack || !source) {
        return (
          <ProductLoadError
            title="Local World Pack unavailable"
            message="This local World Pack is no longer in the World Library."
            onReturnToLibrary={() => setView({ kind: "library" })}
          />
        );
      }
    }
    const mountedPack = pack;
    const auditSource = source;
    const entryKey = `${view.source.kind}:${view.source.packId}`;
    return (
      <MisruleApp
        pack={mountedPack}
        source={auditSource}
        runtimeDefaults={runtimeDefaults}
        auditMode={auditMode}
        hasEnteredBefore={enteredPackKeys.has(entryKey)}
        onEntryDismissed={() => setEnteredPackKeys((prev) => (prev.has(entryKey) ? prev : new Set(prev).add(entryKey)))}
        onReturnToLibrary={() => setView({ kind: "library" })}
        onEdit={auditSource.kind === "inline" ? () => setView({ kind: "editor", mode: "edit", packId: mountedPack.packId }) : undefined}
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
      onOpenBundled={(packId) => setView({ kind: "clockwork", source: { kind: "bundled", packId } })}
      onOpenLocal={(packId) => setView({ kind: "clockwork", source: { kind: "local", packId } })}
      onCreatePack={() => setView({ kind: "editor", mode: "create" })}
      onEditPack={(packId) => setView({ kind: "editor", mode: "edit", packId })}
    />
  );
}
