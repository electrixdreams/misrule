import { useEffect, useRef, type RefObject } from "react";
import type { AuditErrorResponse } from "@/lib/contracts";

type Props = {
  error: AuditErrorResponse["error"] | null;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onRetry: () => void;
};

export function AuditFailureDialog({ error, returnFocusRef, onClose, onRetry }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!error) return;
    const returnTarget = returnFocusRef.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    primaryRef.current?.focus();
    return () => returnTarget?.focus();
  }, [error, returnFocusRef]);

  if (!error) return null;
  return (
    <div className="modal-backdrop audit-failure-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="audit-failure-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-failure-title"
        aria-describedby="audit-failure-description"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
            return;
          }
          if (event.key !== "Tab") return;
          const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
          if (!controls.length) return;
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <span>Audit blocked · {error.code}</span>
        <h2 id="audit-failure-title">No partial finding was accepted.</h2>
        <p id="audit-failure-description">{error.message}</p>
        <div>
          {error.retryable ? <button ref={primaryRef} type="button" onClick={onRetry}>Retry server audit</button> : null}
          <button ref={error.retryable ? undefined : primaryRef} type="button" onClick={onClose}>Return to archive</button>
        </div>
      </section>
    </div>
  );
}
