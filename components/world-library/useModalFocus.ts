"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function useModalFocus(
  open: boolean,
  dialogRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const returnTargetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTargetRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      const root = dialogRef.current;
      const first = root?.querySelector<HTMLElement>(FOCUSABLE) ?? null;
      (first ?? root)?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      returnTargetRef.current?.focus();
    };
  }, [open, dialogRef]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const root = dialogRef.current;
    if (!root) return;
    const controls = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!controls.length) return;

    const first = controls[0];
    const last = controls[controls.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return onKeyDown;
}
