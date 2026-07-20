import type { AuditErrorCode } from "@/lib/contracts";

export type ProviderFailureDiagnostic = {
  stage: "candidate-generation" | "focused-adjudication";
  provider: string;
  endpointHost: string;
  requestedModel: string;
  upstreamStatus: number | null;
  upstreamCode: string | number | null;
  upstreamType: string | null;
  upstreamRequestId: string | null;
  sanitizedUpstreamMessage: string | null;
  latencyMs: number;
  promptVersion: string;
  schemaVersion: string;
};

export class AuditServiceError extends Error {
  constructor(
    readonly code: AuditErrorCode,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly providerFailureDiagnostic?: ProviderFailureDiagnostic,
  ) {
    super(message);
  }
}
