import { NextResponse } from "next/server";
import { auditRequestSchema, type AuditErrorResponse } from "@/lib/contracts";
import { AuditServiceError, createDefaultGateway, executeLiveAudit } from "@/lib/audit-service.server";
import { readBoundedJsonRequest } from "@/lib/audit-request.server";
import { MAX_WORLD_PACK_BYTES, utf8ByteLength } from "@/lib/world-pack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
    body = await readBoundedJsonRequest(request);
  } catch (error) {
    if (error instanceof AuditServiceError) return errorResponse("unparsed-request", error);
    return errorResponse("unparsed-request", new AuditServiceError("INVALID_REQUEST", "The audit request was not valid JSON.", 400, false));
  }
  if (
    typeof body === "object" &&
    body !== null &&
    "source" in body &&
    typeof body.source === "object" &&
    body.source !== null &&
    "kind" in body.source &&
    body.source.kind === "inline" &&
    "pack" in body.source &&
    utf8ByteLength(JSON.stringify(body.source.pack)) > MAX_WORLD_PACK_BYTES
  ) {
    const requestId = "clientRequestId" in body && typeof body.clientRequestId === "string" ? body.clientRequestId : "invalid-request";
    return errorResponse(requestId, new AuditServiceError("WORLD_PACK_TOO_LARGE", "The inline World Pack exceeds the allowed size.", 413, false));
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
