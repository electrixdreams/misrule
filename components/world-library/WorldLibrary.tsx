"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorldPack } from "@/lib/world-pack";
import {
  WorldLibraryError,
  deleteLocalWorldPack,
  loadWorldLibrary,
  resetLocalWorldLibrary,
  type WorldLibraryEntry,
  type WorldLibraryErrorCode,
} from "@/lib/world-library.client";
import { downloadWorldPack } from "@/lib/world-pack-download.client";
import { WorldPackImportDialog } from "./WorldPackImportDialog";
import { ConfirmWorldPackAction } from "./ConfirmWorldPackAction";
import { WorldPackSummary } from "./WorldPackSummary";

function LibraryErrorState({
  error,
  onReset,
  onRetry,
}: {
  error: { code: WorldLibraryErrorCode; message: string };
  onReset: () => void;
  onRetry: () => void;
}) {
  const canReset = error.code === "CORRUPTED_ENVELOPE" || error.code === "UNSUPPORTED_VERSION";
  return (
    <div role="alert" className="library-error">
      <p className="library-error-title">The World Library could not be loaded.</p>
      <p>{error.message}</p>
      {canReset ? (
        <button type="button" className="btn btn-danger" onClick={onReset}>Reset World Library</button>
      ) : (
        <button type="button" className="btn" onClick={onRetry}>Retry</button>
      )}
    </div>
  );
}

export function WorldLibrary({
  bundledPacks,
  onOpenBundled,
  onOpenLocal = () => undefined,
  onCreatePack = () => undefined,
  onEditPack = () => undefined,
}: {
  bundledPacks: WorldPack[];
  onOpenBundled: (packId: string) => void;
  onOpenLocal?: (packId: string) => void;
  onCreatePack?: () => void;
  onEditPack?: (packId: string) => void;
}) {
  const [entries, setEntries] = useState<WorldLibraryEntry[]>([]);
  const [libraryError, setLibraryError] = useState<{ code: WorldLibraryErrorCode; message: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorldLibraryEntry | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedBundledPackId, setSelectedBundledPackId] = useState<string | null>(
    bundledPacks[0]?.packId ?? null,
  );

  // Local-shelf selection remains independent from the bundled shelf.
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);

  const reload = useCallback(() => {
    try {
      const envelope = loadWorldLibrary();
      setEntries(envelope.entries);
      setLibraryError(null);
      setDeleteError(null);
    } catch (error) {
      if (error instanceof WorldLibraryError) {
        setEntries([]);
        setLibraryError({ code: error.code, message: error.message });
      } else {
        setEntries([]);
        setLibraryError({ code: "STORAGE_UNAVAILABLE", message: "The World Library could not be read." });
      }
    }
  }, []);

  useEffect(() => {
    // Browser-local storage is only available after mount; the initial empty
    // state keeps server and client renders consistent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  useEffect(() => {
    if (!selectedPackId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedPackId(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedPackId]);

  const selectedEntry = entries.find((entry) => entry.pack.packId === selectedPackId) ?? null;
  const selectedBundledPack =
    bundledPacks.find((pack) => pack.packId === selectedBundledPackId) ?? bundledPacks[0] ?? null;

  const handleExport = useCallback((pack: WorldPack) => {
    try {
      downloadWorldPack(pack);
      setExportError(null);
    } catch {
      setExportError(`Could not export ${pack.title}.`);
    }
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return;
    const title = deleteTarget.pack.title;
    let removed = false;
    try {
      removed = deleteLocalWorldPack(deleteTarget.pack.packId);
    } catch {
      removed = false;
    }
    setDeleteTarget(null);
    if (removed) {
      reload();
      setSelectedPackId(null);
    } else {
      setDeleteError(`Could not remove ${title}.`);
    }
  }, [deleteTarget, reload]);

  const handleResetConfirm = useCallback(() => {
    try {
      resetLocalWorldLibrary();
    } catch {
      // fall through to the same reload below
    }
    setResetOpen(false);
    reload();
    setSelectedPackId(null);
  }, [reload]);

  return (
    <div className="world-library">
      <header className="library-header">
        <p className="leaf-eyebrow">Misrule</p>
        <h1 id="library-title">World Library</h1>
        <p className="library-intro">
          Find where the world turns against itself. Browse the bundled worlds and the World Packs saved in this browser.
        </p>
      </header>

      {libraryError ? (
        <LibraryErrorState error={libraryError} onReset={() => setResetOpen(true)} onRetry={reload} />
      ) : (
        <div className="library-main">
          <section className="bundled-column" aria-labelledby="bundled-worlds-label">
            <p id="bundled-worlds-label" className="shelf-label">Bundled worlds</p>
            <div className="bundled-spine-shelf" aria-label="Bundled worlds">
              {bundledPacks.map((pack) => (
                <button
                  key={pack.packId}
                  type="button"
                  className={`pack-spine${selectedBundledPack?.packId === pack.packId ? " is-open" : ""}`}
                  aria-label={pack.title}
                  aria-pressed={selectedBundledPack?.packId === pack.packId}
                  onClick={() => setSelectedBundledPackId(pack.packId)}
                >
                  <span className="pack-spine-title">{pack.title}</span>
                </button>
              ))}
            </div>

            {selectedBundledPack ? (
              <article className="info-panel bundled-card">
                <p className="info-panel-kind">Bundled World Pack</p>
                <h2>{selectedBundledPack.title}</h2>
                <p className="info-panel-sub">
                  {selectedBundledPack.disclosure ?? "Synthetic demo — not a real audit result."}
                </p>
                <WorldPackSummary pack={selectedBundledPack} />
                <p className="info-panel-desc">{selectedBundledPack.description}</p>
                <p className="info-panel-id">ID {selectedBundledPack.packId}</p>
                <div className="info-panel-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => onOpenBundled(selectedBundledPack.packId)}
                  >
                    Open archive
                  </button>
                  <button type="button" className="btn" onClick={() => handleExport(selectedBundledPack)}>
                    Export World Pack
                  </button>
                </div>
              </article>
            ) : null}
          </section>

          <div className="shelf-column">
            <div className="shelf-toolbar">
              <p className="shelf-label">Your world packs</p>
              <button type="button" className="btn" onClick={() => setImportOpen(true)}>Import World Pack</button>
            </div>

            {exportError ? <p role="alert" className="library-error-line">{exportError}</p> : null}
            {deleteError ? <p role="alert" className="library-error-line">{deleteError}</p> : null}

            <div className="pack-shelf-wrap">
              <div className="pack-shelf">
                {entries.map((entry) => (
                  <button
                    key={entry.pack.packId}
                    type="button"
                    className={`pack-spine${selectedPackId === entry.pack.packId ? " is-open" : ""}`}
                    aria-expanded={selectedPackId === entry.pack.packId}
                    aria-controls="shelf-popover"
                    onClick={() =>
                      setSelectedPackId((current) => (current === entry.pack.packId ? null : entry.pack.packId))
                    }
                  >
                    <span className="pack-spine-title">{entry.pack.title}</span>
                  </button>
                ))}
                <button type="button" className="pack-spine pack-spine--add" onClick={onCreatePack} aria-label="Create World Pack">
                  <span className="pack-spine-add-mark" aria-hidden="true">+</span>
                  <span className="pack-spine-title">New World Pack</span>
                </button>
              </div>

              {selectedEntry ? (
                <div id="shelf-popover" className="info-panel shelf-popover">
                  <button type="button" className="shelf-popover-close" onClick={() => setSelectedPackId(null)} aria-label="Close">
                    ×
                  </button>
                  <p className="info-panel-kind">Local World Pack</p>
                  <h2>{selectedEntry.pack.title}</h2>
                  <p className="info-panel-sub">Updated {selectedEntry.updatedAt}</p>
                  <WorldPackSummary pack={selectedEntry.pack} />
                  <p className="info-panel-desc">{selectedEntry.pack.description}</p>
                  <p className="info-panel-id">ID {selectedEntry.pack.packId}</p>
                  <div className="info-panel-actions">
                    <button type="button" className="btn btn-primary" onClick={() => onOpenLocal(selectedEntry.pack.packId)}>
                      Audit
                    </button>
                    <button type="button" className="btn" onClick={() => onEditPack(selectedEntry.pack.packId)}>
                      Edit
                    </button>
                    <button type="button" className="btn" onClick={() => handleExport(selectedEntry.pack)}>
                      Export
                    </button>
                    <button type="button" className="btn btn-danger" onClick={() => setDeleteTarget(selectedEntry)}>
                      Delete
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {entries.length === 0 ? (
              <p className="shelf-empty-hint">
                No World Packs saved yet. Import a world-pack/v1 JSON file, or paste one, to begin your archive.
              </p>
            ) : null}
          </div>
        </div>
      )}

      <WorldPackImportDialog open={importOpen} onClose={() => setImportOpen(false)} onSaved={reload} />

      <ConfirmWorldPackAction
        open={deleteTarget !== null}
        title="Delete local World Pack"
        message={`Delete “${deleteTarget?.pack.title}”? This cannot be undone and only removes your local copy.`}
        confirmLabel="Delete permanently"
        tone="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmWorldPackAction
        open={resetOpen}
        title="Reset World Library"
        message="Reset the World Library? This removes all local World Packs from browser storage. Bundled samples are unaffected."
        confirmLabel="Remove local World Packs"
        tone="danger"
        onConfirm={handleResetConfirm}
        onCancel={() => setResetOpen(false)}
      />
    </div>
  );
}
