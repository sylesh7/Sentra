export type ProvenanceVerdict =
  | {
      status: "SIGNED_VERIFIED";
      scrutiny: "normal_scrutiny";
      keyid: string;
      directoryUrl: string;
      evidence: Record<string, unknown>;
    }
  | {
      status: "UNSIGNED" | "SIGNATURE_INVALID" | "CONTENT_DIGEST_MISMATCH" | "KEY_NOT_IN_DIRECTORY" | "DIRECTORY_UNREACHABLE" | "EXPIRED";
      scrutiny: "max_scrutiny";
      reason: string;
      evidence: Record<string, unknown>;
    };
