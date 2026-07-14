import { z } from "zod";

/**
 * Where a candidate payment field was found in the source page. Per the design rule
 * carried through this whole project: structured/self-declared content (JSON-LD, Open
 * Graph tags, CSS-hidden divs) NEVER confers trust just because it's structured -- this
 * is exactly the exploit surface in both Zscaler Campaign 1 and Campaign 2.
 */
export const fieldSourceSchema = z.enum([
  "visible_text",
  "json_ld",
  "open_graph",
  "hidden_css",
  "meta_tag",
  "unknown",
]);
export type FieldSource = z.infer<typeof fieldSourceSchema>;

const sourcedFieldSchema = z.object({
  value: z.string(),
  source: fieldSourceSchema,
  rawSnippet: z.string().optional(),
});
export type SourcedField = z.infer<typeof sourcedFieldSchema>;

export const extractedPaymentFieldsSchema = z.object({
  recipientAddress: sourcedFieldSchema.nullable(),
  amount: sourcedFieldSchema.nullable(),
  currency: sourcedFieldSchema.nullable(),
  reasoning: z.string().optional(),
});
export type ExtractedPaymentFields = z.infer<typeof extractedPaymentFieldsSchema>;

export interface PageContent {
  url: string;
  visibleText: string;
  jsonLd: string[];
  openGraphTags: Record<string, string>;
  hiddenCssContent: string[];
}
