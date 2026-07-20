"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicRuntimeDefaults, RuntimeSettings } from "@/lib/contracts";

type Props = {
  open: boolean;
  settings: RuntimeSettings;
  defaults: PublicRuntimeDefaults;
  onClose: () => void;
  onSave: (settings: RuntimeSettings) => void;
};

export function RuntimeSettingsDialog({ open, settings, defaults, onClose, onSave }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(settings);

  function closeWithoutSaving() {
    setDraft(settings);
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    const returnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = requestAnimationFrame(() => firstFieldRef.current?.focus());
    return () => {
      cancelAnimationFrame(focusFrame);
      returnTarget?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeWithoutSaving(); }}>
      <section
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        aria-describedby="settings-description"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeWithoutSaving();
            return;
          }
          if (event.key !== "Tab") return;
          if (event.shiftKey && event.target === firstFieldRef.current) {
            event.preventDefault();
            saveButtonRef.current?.focus();
            return;
          }
          if (!event.shiftKey && event.target === saveButtonRef.current) {
            event.preventDefault();
            firstFieldRef.current?.focus();
            return;
          }
          const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled)") ?? []);
          if (!controls.length) return;
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && (document.activeElement === first || event.target === first)) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && (document.activeElement === last || event.target === last)) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <span>Runtime settings · session only</span>
        <h2 id="settings-title">Choose the reasoning provider.</h2>
        <p id="settings-description">
          These values apply to audits from this browser tab. The API key is held only in memory, sent to Misrule&apos;s server for the selected request, and never stored in browser storage.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave({ ...draft, apiKey: draft.apiKey?.trim() || undefined });
          }}
        >
          <label>
            <span>Provider</span>
            <select
              ref={firstFieldRef}
              value={draft.provider}
              onChange={(event) => {
                const provider = event.target.value as RuntimeSettings["provider"];
                setDraft((current) => ({
                  ...current,
                  provider,
                  apiEndpoint:
                    provider === "openrouter"
                      ? "https://openrouter.ai/api/v1"
                      : current.provider === "openrouter"
                        ? "https://api.openai.com/v1"
                        : current.apiEndpoint,
                }));
              }}
            >
              <option value="openrouter">OpenRouter</option>
              <option value="openai-compatible">OpenAI-compatible</option>
            </select>
          </label>
          <label>
            <span>API endpoint</span>
            <input
              type="url"
              required
              spellCheck={false}
              autoComplete="url"
              value={draft.apiEndpoint}
              onChange={(event) => setDraft((current) => ({ ...current, apiEndpoint: event.target.value }))}
            />
            <small>Enabled hosts: {defaults.allowedEndpointHosts.join(", ")}</small>
          </label>
          <label>
            <span>Model</span>
            <input
              type="text"
              required
              spellCheck={false}
              autoComplete="off"
              value={draft.model}
              onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
            />
          </label>
          <label>
            <span>API key</span>
            <input
              type="password"
              spellCheck={false}
              autoComplete="off"
              placeholder={defaults.hasServerApiKey ? "Server key configured · leave blank to use it" : "Enter a key for this browser session"}
              value={draft.apiKey ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value || undefined }))}
            />
            <small>{defaults.hasServerApiKey ? "A server-side default key is available." : "No server-side default key is configured."}</small>
          </label>
          <aside>
            Misrule will send the session key and audit input to <strong>{draft.apiEndpoint || "the selected endpoint"}</strong>. Only use a provider you trust.
          </aside>
          <div className="settings-actions">
            <button type="button" onClick={() => setDraft((current) => ({ ...current, apiKey: undefined }))}>Forget session key</button>
            <button type="button" onClick={closeWithoutSaving}>Cancel</button>
            <button ref={saveButtonRef} type="submit">Use these settings</button>
          </div>
        </form>
      </section>
    </div>
  );
}
