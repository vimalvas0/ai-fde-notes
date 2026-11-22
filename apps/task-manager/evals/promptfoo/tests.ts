// promptfoo test generator: turns each line of ../dataset.jsonl into a promptfoo test,
// so the 30 cases live in one file that both runners read.

import { readFileSync } from "node:fs";
import type { Case } from "../graders.ts";

const js = (fn: string, metric: string) => ({ type: "javascript", value: `file://asserts.ts:${fn}`, metric });

export default function tests() {
  const file = new URL("../dataset.jsonl", import.meta.url);
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const c: Case = JSON.parse(line);
      const assert: object[] = [js("intentExact", "intent_exact"), js("intentNoFallback", "intent_no_fallback")];
      const want = c.expect.labels;
      if (want) {
        if ("time" in want) assert.push(js("labelTime", "label_time"));
        if ("date" in want) assert.push(js("labelDate", "label_date"));
        if ("location" in want) assert.push(js("labelLocation", "label_location"));
        assert.push(js("summaryShape", "summary_shape"), {
          // promptfoo's own LLM judge, instead of judgeSummary in ../graders.ts.
          type: "llm-rubric",
          metric: "summary_judge",
          transform: "output.labels.summary",
          value:
            `The text is a short title for the task "${c.input}". Pass only if it names the task's action or object so it can be told apart from other tasks, ` +
            "adds nothing the task does not say, and leaves out the time, date and place.",
        });
      }
      return {
        description: `${c.id}: ${c.input}`,
        vars: { input: c.input, expect: c.expect, withLabels: Boolean(want) },
        assert,
        metadata: { id: c.id, tags: c.tags.join(",") },
      };
    });
}
