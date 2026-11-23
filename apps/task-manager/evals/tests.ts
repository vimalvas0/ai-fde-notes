// promptfoo test generator: turns each line of dataset.jsonl into a promptfoo test.
// The dataset stays one JSON object per line, so it is still easy to edit by hand and diff.

import { readFileSync } from "node:fs";
import type { Expect } from "./asserts.ts";

type Case = { id: string; tags: string[]; input: string; expect: Expect };

const js = (fn: string, metric: string) => ({ type: "javascript", value: `file://asserts.ts:${fn}`, metric });

export default function tests() {
  return readFileSync(new URL("./dataset.jsonl", import.meta.url), "utf8")
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
          // LLM judge: for what code cannot check, whether the summary is a good title.
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
