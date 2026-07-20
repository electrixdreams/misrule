import { useEffect, useRef } from "react";
import type { AuditWorldPackSource } from "@/lib/contracts";
import type { WorldPack } from "@/lib/world-pack";

export function WorldDrawer({
  pack,
  source,
  open,
  auditRunning,
  onClose,
  onReturnToLibrary,
  onEdit,
}: {
  pack: WorldPack;
  source: AuditWorldPackSource;
  open: boolean;
  auditRunning: boolean;
  onClose: () => void;
  onReturnToLibrary?: () => void;
  onEdit?: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const returnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => returnTarget?.focus();
  }, [open]);
  if (!open) return null;
  const provenance = source.kind === "bundled" ? "Bundled sample" : "Saved local World Pack";
  const focusableSelector = "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section
        ref={dialogRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
            return;
          }
          if (event.key === "Tab") {
            const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
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
          }
        }}
      >
        <p className="leaf-eyebrow">World archive</p>
        <h2 id="drawer-title">{pack.title}</h2>
        <p>{provenance} mounted in Clockwork. Inspect its rules and spans, return to the library, or edit the saved local pack when available.</p>
        <div className="archive-volume">
          <strong>{pack.world.title}</strong>
          <span>{provenance} · {pack.books.length} {pack.books.length === 1 ? "volume" : "volumes"} · {pack.rules.length} rules · {pack.spans.length} spans</span>
        </div>
        <div className="drawer-actions">
          <button ref={closeRef} type="button" onClick={onClose}>Return to instrument</button>
          {onReturnToLibrary ? <button type="button" onClick={onReturnToLibrary}>Return to World Library</button> : null}
          {onEdit ? <button type="button" onClick={onEdit} disabled={auditRunning}>Edit local pack</button> : null}
        </div>
      </section>
    </div>
  );
}
