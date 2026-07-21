export function AuditCurtain({ open, auditMode }: { open: boolean; auditMode: "live" | "mock" }) {
  if (!open) return null;
  return (
    <div className="audit-curtain" role="status" aria-live="polite" aria-label="Audit in progress">
      <div className="audit-hourglass" aria-hidden="true">
        <svg className="hourglass-svg" viewBox="0 0 120 180">
          <rect className="hourglass-cap" x="14" y="8" width="92" height="10" rx="3" />
          <rect className="hourglass-cap" x="14" y="162" width="92" height="10" rx="3" />
          <path className="hourglass-frame" d="M22,16 L98,16 L64,90 L98,164 L22,164 L64,90 Z" />
          <path className="hourglass-sand-top" d="M28,22 L92,22 L64,84 Z" />
          <path className="hourglass-sand-bottom" d="M64,96 L94,160 L34,160 Z" />
          <line className="hourglass-stream" x1="64" y1="84" x2="64" y2="97" />
        </svg>
      </div>
      <div>
        <span>{auditMode === "mock" ? "Deterministic mock audit · not live" : "Live rule audit"}</span>
        <h2>Auditing rule-to-evidence paths</h2>
        <p>Indeterminate. Misrule is waiting for one server response.</p>
      </div>
    </div>
  );
}
