// promptfoo custom provider: runs the app's real three-step pipeline on one case.
// `config.guardrails` switches the guardrails on or off, so the config can list the same pipeline
// twice (baseline and guardrails) and promptfoo shows the two side by side in one table.

import { runPipeline } from "../server/pipeline.ts";

type Options = { id?: string; config?: { guardrails?: boolean } };

export default class ResumeMatcherProvider {
  private guardrails: boolean;
  private providerId: string;

  constructor(options: Options = {}) {
    this.guardrails = options.config?.guardrails ?? true;
    this.providerId = options.id ?? `resume-matcher:guardrails=${this.guardrails}`;
  }

  id() {
    return this.providerId;
  }

  // The prompt is unused: the case's resume, jd and instruction arrive as vars and go to the real pipeline.
  async callApi(_prompt: string, context?: { vars?: Record<string, unknown> }) {
    const vars = context?.vars ?? {};
    try {
      const { result } = await runPipeline(
        { resumeText: String(vars.resume ?? ""), jd: String(vars.jd ?? ""), instruction: String(vars.instruction ?? "") },
        { guardrails: this.guardrails },
      );
      return { output: result };
    } catch (err) {
      return { error: String(err) };
    }
  }
}
