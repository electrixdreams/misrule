"use client";

import { useRef } from "react";
import { useModalFocus } from "./useModalFocus";

export function ConfirmWorldPackAction({
  open,
  title,
  message,
  cancelLabel = "Cancel",
  confirmLabel,
  tone = "default",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  cancelLabel?: string;
  confirmLabel: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const onKeyDown = useModalFocus(open, dialogRef, onCancel);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop confirm-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        className={`confirm-dialog${tone === "danger" ? " confirm-dialog--danger" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onKeyDown={onKeyDown}
      >
        <span className="leaf-eyebrow">Confirm action</span>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button type="button" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="confirm-primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
