import "server-only";

import { AuditServiceError } from "@/lib/audit-errors";

export const MAX_AUDIT_REQUEST_BYTES = 1024 * 1024;

export async function readBoundedJsonRequest(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_AUDIT_REQUEST_BYTES) {
    throw new AuditServiceError("REQUEST_TOO_LARGE", "The audit request exceeds the allowed size.", 413, false);
  }

  if (!request.body) {
    throw new AuditServiceError("INVALID_REQUEST", "The audit request was not valid JSON.", 400, false);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_AUDIT_REQUEST_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // The size failure is authoritative even if the source cannot cancel.
      }
      throw new AuditServiceError("REQUEST_TOO_LARGE", "The audit request exceeds the allowed size.", 413, false);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new AuditServiceError("INVALID_REQUEST", "The audit request was not valid JSON.", 400, false);
  }
}
