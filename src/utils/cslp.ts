/**
 * Returns only the Live Preview edit-tag attributes from an entry field's `$`
 * object. `addEditableTags` emits `data-cslp` and `data-cslp-parent-field` and
 * nothing else, so whitelisting those two is behaviourally identical to
 * spreading `$` while provably carrying no event handlers.
 *
 * (Same rationale as visual-builder/test-resources/csr/src/utils/cslp.ts —
 * spreading fetched content as arbitrary JSX attributes flags as DOM-XSS.)
 */
const CSLP_ATTRS = ["data-cslp", "data-cslp-parent-field"] as const;

export const cslp = (tag?: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!tag || typeof tag !== "object") return out;
  const obj = tag as Record<string, unknown>;
  for (const key of CSLP_ATTRS) {
    if (typeof obj[key] === "string") out[key] = obj[key] as string;
  }
  return out;
};

/** The `$` map that `addEditableTags` attaches to an entry. */
export type CslpMap = Record<string, unknown> | undefined;
