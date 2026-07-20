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
        <button type="button" onClick={onReset}>Reset World Library</button>
      ) : (
        <button type="button" onClick={onRetry}>Retry</button>
      )}
    </div>
  );
}

export function WorldLibrary({
  bundledPacks,
  onOpenBundled,
  onCreatePack = () => undefined,
  onEditPack = () => undefined,
}: {
  bundledPacks: WorldPack[];
  onOpenBundled: (packId: string) => void;
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
    if (removed) reload();
    else setDeleteError(`Could not remove ${title}.`);
  }, [deleteTarget, reload]);

  const handleResetConfirm = useCallback(() => {
    try {
      resetLocalWorldLibrary();
    } catch {
      setResetOpen(false);
      reload();
      return;
    }
    setResetOpen(false);
    reload();
  }, [reload]);

  return (
    <div className="world-library">
      <header className="library-header">
        <p className="leaf-eyebrow">Misrule</p>
        <h1 id="library-title">World Library</h1>
        <p className="library-intro">
          Find where the world turns against itself. Browse the bundled sample and the World Packs saved in this browser.
        </p>
      </header>

      <section aria-labelledby="bundled-heading" className="library-section">
        <h2 id="bundled-heading">Bundled sample</h2>
        {bundledPacks.map((pack) => (
          <article key={pack.packId} className="pack-card pack-card--bundled">
            <div className="pack-card-head">
              <h3>{pack.title}</h3>
              <p className="pack-preview-id">ID {pack.packId}</p>
            </div>
            <p className="pack-disclosure">{pack.disclosure ?? "Synthetic demo — not a real audit result."}</p>
            <WorldPackSummary pack={pack} />
            <p className="pack-desc">{pack.description}</p>
            <div className="pack-actions">
              <button type="button" onClick={() => onOpenBundled(pack.packId)}>Open sample</button>
              <button type="button" onClick={() => handleExport(pack)}>Export World Pack</button>
            </div>
          </article>
        ))}
      </section>

      <section aria-labelledby="local-heading" className="library-section">
        <div className="library-section-head">
          <h2 id="local-heading">Your local World Packs</h2>
          <div className="library-section-actions">
            <button type="button" onClick={onCreatePack}>Create World Pack</button>
            <button type="button" onClick={() => setImportOpen(true)}>Import World Pack</button>
          </div>
        </div>

        {exportError ? <p role="alert" className="library-error-line">{exportError}</p> : null}
        {deleteError ? <p role="alert" className="library-error-line">{deleteError}</p> : null}

        {libraryError ? (
          <LibraryErrorState error={libraryError} onReset={() => setResetOpen(true)} onRetry={reload} />
        ) : entries.length === 0 ? (
          <p className="library-empty">
            No World Packs saved yet. Import a world-pack/v1 JSON file, or paste one, to begin your archive.
          </p>
        ) : (
          <ul className="pack-list">
            {entries.map((entry) => (
              <li key={entry.pack.packId} className="pack-card">
                <div className="pack-card-head">
                  <h3>{entry.pack.title}</h3>
                  <p className="pack-preview-id">ID {entry.pack.packId}</p>
                </div>
                <WorldPackSummary pack={entry.pack} />
                <p className="pack-desc">{entry.pack.description}</p>
                <p className="pack-updated">Updated {entry.updatedAt}</p>
                <div className="pack-actions">
                  <button type="button" onClick={() => onEditPack(entry.pack.packId)}>Edit</button>
                  <button type="button" onClick={() => handleExport(entry.pack)}>Export</button>
                  <button type="button" onClick={() => setDeleteTarget(entry)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

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
