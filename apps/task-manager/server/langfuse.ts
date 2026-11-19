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

export type Update = (attributes: Record<string, unknown>) => void;

/**
 * Run fn as a Langfuse observation nested under whatever observation is active.
 * The first call for an input action becomes the root span (one trace per action);
 * every model call and tool run inside it is a child. fn also gets the trace id
 * ("" when Langfuse is off). An error thrown by fn is marked on the observation.
 */
export async function observe<T>(
  name: string,
  asType: "span" | "generation" | "tool",
  input: unknown,
  fn: (update: Update, traceId: string) => Promise<T>,
): Promise<T> {
  if (!langfuseEnabled) return fn(() => {}, "");
  return startActiveObservation(
    name,
    async (observation) => {
      const update: Update = (attributes) => observation.update(attributes as never);
      update({ input });
      try {
        return await fn(update, observation.traceId);
      } catch (error) {
        update({ level: "ERROR", statusMessage: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },
    { asType } as never,
  );
}
