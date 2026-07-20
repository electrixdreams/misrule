import type { AuditErrorCode } from "@/lib/contracts";

export class AuditServiceError extends Error {
  constructor(
    readonly code: AuditErrorCode,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}
