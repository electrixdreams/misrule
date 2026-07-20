import { useEffect, useRef } from "react";
import type { WorldPack } from "@/lib/world-pack";

export function WorldDrawer({ pack, open, onClose }: { pack: WorldPack; open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const returnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => returnTarget?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onKeyDown={(event) => {
          if (event.key === "Tab") {
            event.preventDefault();
            closeRef.current?.focus();
          }
        }}
      >
        <p className="leaf-eyebrow">World archive</p>
        <h2 id="drawer-title">Mounted worlds</h2>
        <p>One complete world is mounted. The empty position is a portability promise, not a fake World Pack.</p>
        <div className="archive-volume"><strong>{pack.title}</strong><span>World archive I · bundled · {pack.rules.length} rules · {pack.spans.length} spans</span></div>
        <div className="empty-volume"><i aria-hidden="true" /><span><strong>No additional world mounted</strong>Second archive position intentionally empty.</span></div>
        <button ref={closeRef} type="button" onClick={onClose}>Return to instrument</button>
      </section>
    </div>
  );
}
