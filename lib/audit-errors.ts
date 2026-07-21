import type { AuditErrorCode } from "@/lib/contracts";

export type ProviderFailureDiagnostic = {
  stage: "candidate-generation" | "focused-adjudication";
  provider: string;
  endpointHost: string;
  requestedModel: string;
  outputTransport: "json_schema" | "json_object";
  upstreamStatus: number | null;
  upstreamCode: string | number | null;
  upstreamType: string | null;
  upstreamRequestId: string | null;
  openRouterRequestId: string | null;
  generationId: string | null;
  openRouterErrorType: string | null;
  openRouterProviderCode: string | number | null;
  openRouterProviderName: string | null;
  sanitizedUpstreamMessage: string | null;
  sanitizedProviderDetail: string | null;
  routerMetadata: SafeOpenRouterMetadata | null;
  latencyMs: number;
  temperature: 0;
  promptVersion: string;
  schemaVersion: string;
};

export type SafeOpenRouterMetadata = {
  attempt?: number;
  requestedModel?: string;
  strategy?: string;
  endpointCounts?: { total?: number; available?: number };
  attemptedProviderNames?: string[];
  selectedProviderName?: string | null;
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
