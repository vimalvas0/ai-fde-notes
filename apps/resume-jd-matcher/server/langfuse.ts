// Langfuse setup. Langfuse's SDK is built on OpenTelemetry: we register a tracer
// provider whose span processor ships every traced observation to Langfuse.

import { LangfuseSpanProcessor } from "@langfuse/otel";
import { startActiveObservation } from "@langfuse/tracing";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export const langfuseEnabled = Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);

/** Call once at startup, before any LLM call. Does nothing without Langfuse keys. */
export function startLangfuse(): void {
  if (!langfuseEnabled) return;
  new NodeTracerProvider({
    spanProcessors: [new LangfuseSpanProcessor({ exportMode: "immediate" })],
  }).register();
}

type Update = (attributes: Record<string, unknown>) => void;

/**
 * Run fn as a Langfuse observation nested under whatever observation is active
 * (so the pipeline is one trace, each model call a child "generation").
 * A plain call when Langfuse is off. An error thrown by fn is marked on the observation.
 */
export async function observe<T>(
  name: string,
  asType: "span" | "generation",
  input: unknown,
  fn: (update: Update) => Promise<T>,
): Promise<T> {
  if (!langfuseEnabled) return fn(() => {});
  return startActiveObservation(
    name,
    async (observation) => {
      const update: Update = (attributes) => observation.update(attributes as never);
      update({ input });
      try {
        return await fn(update);
      } catch (error) {
        update({ level: "ERROR", statusMessage: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },
    { asType } as never,
  );
}
