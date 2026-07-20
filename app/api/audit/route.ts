import { NextResponse } from "next/server";
import { auditRequestSchema, type AuditErrorResponse } from "@/lib/contracts";
import { AuditServiceError, createDefaultGateway, executeLiveAudit } from "@/lib/audit-service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(requestId: string, error: AuditServiceError) {
  const body: AuditErrorResponse = {
    ok: false,
    requestId,
    error: { code: error.code, message: error.message, retryable: error.retryable, fallbackOffer: null },
  };
  return NextResponse.json(body, { status: error.status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("unparsed-request", new AuditServiceError("INVALID_REQUEST", "The audit request was not valid JSON.", 400, false));
  }
  const parsed = auditRequestSchema.safeParse(body);
  if (!parsed.success) {
    const requestId = typeof body === "object" && body && "clientRequestId" in body && typeof body.clientRequestId === "string" ? body.clientRequestId : "invalid-request";
    return errorResponse(requestId, new AuditServiceError("INVALID_REQUEST", "The audit request did not match the public contract.", 400, false));
  }

  try {
    const response = await executeLiveAudit(parsed.data, {
      gateway: createDefaultGateway(parsed.data),
      evidenceDirectory: process.env.MISRULE_EVIDENCE_DIR,
    });
    return NextResponse.json(response, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuditServiceError) return errorResponse(parsed.data.clientRequestId, error);
    return errorResponse(parsed.data.clientRequestId, new AuditServiceError("INTERNAL_ERROR", "The audit could not be completed.", 500, false));
  }
}
