import { auditErrorResponseSchema, auditSuccessResponseSchema, type AuditResponse, type AuditWorldPackSource, type RuntimeSettings } from "@/lib/contracts";

export async function requestAudit(source: AuditWorldPackSource, runtime: RuntimeSettings, signal?: AbortSignal): Promise<AuditResponse> {
  const clientRequestId = crypto.randomUUID();
  const response = await fetch("/api/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schemaVersion: "audit-api/v2", clientRequestId, source, intent: { mode: "live" }, runtime }),
    signal,
  });
  const json: unknown = await response.json();
  const success = auditSuccessResponseSchema.safeParse(json);
  if (success.success) return success.data;
  const failure = auditErrorResponseSchema.safeParse(json);
  if (failure.success) return failure.data;
  return {
    ok: false,
    requestId: clientRequestId,
    error: { code: "INTERNAL_ERROR", message: "The audit service returned an unreadable response.", retryable: false, fallbackOffer: null },
  };
}
