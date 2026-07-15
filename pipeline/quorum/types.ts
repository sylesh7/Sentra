import type { ExtractedPaymentFields } from "../quarantine/types.js";

export interface QuorumMemberResult {
  model: string;
  fields: ExtractedPaymentFields;
}

export interface QuorumMemberFailure {
  model: string;
  error: string;
}

export interface QuorumVerdict {
  /**
   * AGREE: enough models responded and all agreed. DISAGREE: enough models responded
   * but they didn't agree. UNAVAILABLE: fewer than 2 models could even be reached (e.g.
   * a provider outage or an exhausted API key) -- there's no quorum to evaluate at all.
   * All three are non-AGREE for the planner's purposes (see pipeline/planner/plan.ts),
   * but keeping them distinct means a BLOCK reason says "the provider was down" instead
   * of the misleading "the models disagreed" when nothing was ever compared.
   */
  agreement: "AGREE" | "DISAGREE" | "UNAVAILABLE";
  members: QuorumMemberResult[];
  failures: QuorumMemberFailure[];
  /** Only set when agreement === "AGREE" -- the fields every model independently confirmed. */
  consensusFields: ExtractedPaymentFields | null;
  reasons: string[];
}
