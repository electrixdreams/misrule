import { auditErrorResponseSchema, auditSuccessResponseSchema, type AuditResponse } from "@/lib/contracts";

export async function requestAudit(fixtureId: string, signal?: AbortSignal): Promise<AuditResponse> {
  const clientRequestId = crypto.randomUUID();
  const response = await fetch("/api/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schemaVersion: "audit-api/v1", fixtureId, clientRequestId, intent: { mode: "live" } }),
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
