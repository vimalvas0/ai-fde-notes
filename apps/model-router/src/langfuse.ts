// Langfuse setup. Langfuse's SDK is built on OpenTelemetry: we register a tracer
// provider whose span processor ships every traced LLM call to Langfuse.

import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export const langfuseEnabled = Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);

let provider: NodeTracerProvider | undefined;

/** Call once at startup, before any LLM call. Does nothing without Langfuse keys. */
export function startLangfuse(): void {
  if (!langfuseEnabled) return;
  // "immediate" because a CLI exits right after one call — don't hold spans in a batch.
  provider = new NodeTracerProvider({
    spanProcessors: [new LangfuseSpanProcessor({ exportMode: "immediate" })],
  });
  provider.register();
}

/** Send anything still buffered. Without this, a short-lived process loses its trace. */
export async function stopLangfuse(): Promise<void> {
  await provider?.forceFlush();
  await provider?.shutdown();
}
