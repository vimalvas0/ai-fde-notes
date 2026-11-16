// The routing table. Names are the ones defined in apps/litellm-config.yaml.
// To route differently, edit this file: no other code changes.

export type Complexity = "simple" | "complex";

/** Small, fast, cheap model that judges every prompt before routing. */
export const CLASSIFIER_MODEL = "claude-haiku";

/** Models to try for each kind of prompt, in order. The next one is used if a call fails. */
export const ROUTES: Record<Complexity, string[]> = {
  simple: ["claude-haiku", "gpt-5-mini"],
  complex: ["claude-sonnet", "gpt-5-mini"],
};
