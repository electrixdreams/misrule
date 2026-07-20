export function AuditCurtain({ open, auditMode }: { open: boolean; auditMode: "live" | "mock" }) {
  if (!open) return null;
  return (
    <div className="audit-curtain" role="status" aria-live="polite" aria-label="Audit in progress">
      <div className="audit-dial" aria-hidden="true"><i /><i /><i /></div>
      <div>
        <span>{auditMode === "mock" ? "Deterministic mock audit · not live" : "Live rule audit"}</span>
        <h2>Auditing rule-to-evidence paths</h2>
        <p>Indeterminate. Misrule is waiting for one server response.</p>
      </div>
    </div>
  );
}
