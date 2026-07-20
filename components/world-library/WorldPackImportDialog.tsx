"use client";

import { useRef, useState } from "react";
import { MAX_WORLD_PACK_BYTES } from "@/lib/world-pack";
import { parseWorldPackJson, type WorldPackImportResult } from "@/lib/world-pack-io";
import { saveLocalWorldPack, WorldLibraryError } from "@/lib/world-library.client";
import type { WorldPack } from "@/lib/world-pack";
import { useModalFocus } from "./useModalFocus";
import { WorldPackSummary } from "./WorldPackSummary";

const SAVE_ERRORS: Record<string, string> = {
  PACK_TOO_LARGE: "The World Pack exceeds the 768 KiB limit.",
  PACK_COUNT_LIMIT: "The local World Library already contains eight World Packs.",
  LIBRARY_SIZE_LIMIT: "The World Library exceeds the 3.5 MiB limit.",
  QUOTA_EXCEEDED: "The browser rejected the write because its storage quota was exceeded.",
  INVALID_PACK: "The World Pack failed validation.",
  STORAGE_UNAVAILABLE: "Browser-local storage is unavailable.",
};

function issueTitle(code: string): string {
  switch (code) {
    case "MALFORMED_JSON":
      return "The JSON could not be parsed.";
    case "UNSUPPORTED_SCHEMA_VERSION":
      return "This World Pack version is not supported.";
    case "INVALID_WORLD_PACK":
      return "The World Pack is not valid.";
    case "WORLD_PACK_TOO_LARGE":
      return "The World Pack is too large.";
    default:
      return "The World Pack could not be imported.";
  }
}

export function WorldPackImportDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"file" | "paste">("file");
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [result, setResult] = useState<WorldPackImportResult | null>(null);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [pendingPack, setPendingPack] = useState<WorldPack | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setMode("file");
    setFileName(null);
    setRawText("");
    setResult(null);
    setValidateError(null);
    setSaveError(null);
    setConflict(false);
    setPendingPack(null);
    setBusy(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose() {
    reset();
    onClose();
  }

  const onKeyDown = useModalFocus(open, dialogRef, handleClose);

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setFileName(null);
      setRawText("");
      setResult(null);
      return;
    }
    setFileName(file.name);
    setResult(null);
    setValidateError(null);
    setConflict(false);
    setPendingPack(null);
    if (file.size > MAX_WORLD_PACK_BYTES) {
      setRawText("");
      setResult({
        ok: false,
        code: "WORLD_PACK_TOO_LARGE",
        issues: [{ code: "too_big", path: "$", message: "The selected file exceeds the 768 KiB import limit." }],
      });
      return;
    }
    const text = await file.text();
    setRawText(text);
    setResult(parseWorldPackJson(text));
  }

  function onPasteChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setRawText(event.target.value);
    setResult(null);
    setValidateError(null);
    setConflict(false);
    setPendingPack(null);
  }

  function handleValidate() {
    if (!rawText.trim()) {
      setValidateError("Provide World Pack JSON to validate.");
      return;
    }
    setValidateError(null);
    setConflict(false);
    setPendingPack(null);
    setSaveError(null);
    setResult(parseWorldPackJson(rawText));
  }

  function handleSave() {
    if (!result || !result.ok) return;
    setBusy(true);
    try {
      saveLocalWorldPack(result.pack);
      onSaved();
      handleClose();
    } catch (error) {
      setBusy(false);
      if (error instanceof WorldLibraryError && error.code === "DUPLICATE_ID") {
        setConflict(true);
        setPendingPack(result.pack);
        return;
      }
      setSaveError(error instanceof WorldLibraryError ? (SAVE_ERRORS[error.code] ?? error.message) : "The World Pack could not be saved.");
    }
  }

  function handleReplace() {
    if (!pendingPack) return;
    setBusy(true);
    try {
      saveLocalWorldPack(pendingPack, { onConflict: "replace" });
      onSaved();
      handleClose();
    } catch (error) {
      setBusy(false);
      setConflict(false);
      setSaveError(error instanceof WorldLibraryError ? (SAVE_ERRORS[error.code] ?? error.message) : "The World Pack could not be saved.");
    }
  }

  if (!open) return null;

  return (
    <div
      className="modal-backdrop import-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) handleClose();
      }}
    >
      <section
        ref={dialogRef}
        className="import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        aria-describedby="import-description"
        onKeyDown={onKeyDown}
      >
        <span className="leaf-eyebrow">Import</span>
        <h2 id="import-title">Import a World Pack</h2>
        <p id="import-description">
          Import a world-pack/v1 JSON file or paste one. Importing validates the pack but does not save it until you choose to.
        </p>

        <div className="import-tabs">
          <button type="button" aria-pressed={mode === "file"} onClick={() => setMode("file")}>From file</button>
          <button type="button" aria-pressed={mode === "paste"} onClick={() => setMode("paste")}>Paste JSON</button>
        </div>

        {mode === "file" ? (
          <div className="import-file">
            <label className="import-file-label">
              <span>World Pack file</span>
              <input ref={fileInputRef} type="file" accept=".json,application/json,application/ld+json" onChange={onFileChange} />
            </label>
            {fileName ? <p className="import-file-name">Selected: {fileName}</p> : null}
          </div>
        ) : (
          <div className="import-paste">
            <label>
              <span>Paste World Pack JSON</span>
              <textarea value={rawText} onChange={onPasteChange} rows={8} spellCheck={false} aria-label="World Pack JSON" />
            </label>
          </div>
        )}

        <button type="button" className="import-validate" onClick={handleValidate}>Validate</button>

        {validateError ? <p role="alert" className="import-error-line">{validateError}</p> : null}

        {result && !result.ok ? (
          <div role="alert" className="import-issues">
            <p className="import-issue-title">{issueTitle(result.code)}</p>
            <ul className="issue-rows">
              {result.issues.map((issue, index) => (
                <li key={index}>
                  <code>{issue.path}</code> — {issue.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {result && result.ok ? (
          <div className="import-summary">
            <p className="import-valid">Valid world-pack/v1 — ready to save.</p>
            <WorldPackSummary pack={result.pack} />
            <p className="pack-preview-id">ID {result.pack.packId}</p>
          </div>
        ) : null}

        {conflict ? (
          <div role="alert" className="import-conflict">
            <p>A local World Pack already uses this packId ({pendingPack?.packId}). Replace it or cancel.</p>
            <div className="import-conflict-actions">
              <button type="button" onClick={handleClose}>Cancel</button>
              <button type="button" className="confirm-primary" disabled={busy} onClick={handleReplace}>Replace existing local pack</button>
            </div>
          </div>
        ) : result && result.ok ? (
          <div className="import-save">
            <button type="button" className="confirm-primary" disabled={busy} onClick={handleSave}>Save to World Library</button>
          </div>
        ) : null}

        {saveError ? <p role="alert" className="import-error-line">{saveError}</p> : null}

        <div className="import-cancel">
          <button type="button" onClick={handleClose}>Close</button>
        </div>
      </section>
    </div>
  );
}
