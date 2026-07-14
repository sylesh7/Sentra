import type { ExtractedPaymentFields } from "../quarantine/types.js";

export interface QuorumMemberResult {
  model: string;
  fields: ExtractedPaymentFields;
}

export interface QuorumVerdict {
  agreement: "AGREE" | "DISAGREE";
  members: QuorumMemberResult[];
  /** Only set when agreement === "AGREE" -- the fields every model independently confirmed. */
  consensusFields: ExtractedPaymentFields | null;
  reasons: string[];
}
