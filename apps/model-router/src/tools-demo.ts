// npm run tools            run every scenario
// npm run tools -- 404     run one scenario (name or part of it)
//
// Function calling, and what to do when the tool fails. The model never runs
// anything: it only asks for a tool ("call get_order with id X"). Our code runs the
// tool and sends the result back as a message, and the model writes the final answer
// from it. When the tool fails, that message is how the model finds out, so the
// shape of the error decides whether it recovers, retries or makes something up.
//
// The "API" is a tiny HTTP server started inside this script, so the 4xx and 5xx
// responses are real HTTP responses and nothing external is needed.
//
// In Langfuse each scenario is one trace:
//   tool-calls: <scenario>
//   ├─ generation   model call 1   (output: the tool call it asked for)
//   ├─ tool         get_order      (input: arguments, output: what the model sees)
//   │   └─ http-attempt 1..n       (one per try; failed tries are marked)
//   └─ generation   model call 2   (reads the tool result, writes the answer)

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { startActiveObservation, propagateAttributes } from "@langfuse/tracing";
import type OpenAI from "openai";

import { langfuseEnabled, startLangfuse, stopLangfuse } from "./langfuse.ts";
import { ROUTES } from "./models.ts";
import { client } from "./pipeline.ts";

const MODEL = ROUTES.simple[0];
const MAX_ROUNDS = 5; // model calls per scenario; stops a model that keeps asking for tools
const MAX_ATTEMPTS = 3; // tries per tool call for errors worth retrying
const BACKOFF_MS = 200; // wait before retry n is BACKOFF_MS * 2^(n-1)

// ---- The fake API -----------------------------------------------------------
// Which id you send decides which failure you get. `calls` counts requests so an
// endpoint can fail the first times and then recover.

const calls = new Map<string, number>();
const hit = (key: string) => calls.set(key, (calls.get(key) ?? 0) + 1).get(key)!;

const ORDERS: Record<string, { id: string; customer: string; item: string; total: number }> = {
  "ORD-1001": { id: "ORD-1001", customer: "C-100", item: "Mechanical keyboard", total: 89 },
  "ORD-2002": { id: "ORD-2002", customer: "C-100", item: "USB-C dock", total: 120 },
  "ORD-3003": { id: "ORD-3003", customer: "C-100", item: "Monitor arm", total: 65 },
};

function startApi(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(JSON.stringify(body));
    };
    const [, resource, id, sub] = url.pathname.split("/"); // /orders/ORD-1001/shipping

    if (resource === "orders" && !id) {
      const customer = url.searchParams.get("customer") ?? "";
      return send(200, { orders: Object.values(ORDERS).filter((o) => o.customer === customer) });
    }
    if (resource !== "orders" || !id) return send(404, { message: "no such route" });

    if (!/^ORD-\d{4}$/.test(id)) {
      return send(400, { message: `order id must look like ORD-1234, got "${id}"` });
    }
    const order = ORDERS[id];

    if (!sub) {
      return order ? send(200, order) : send(404, { message: `order ${id} does not exist` });
    }

    if (sub === "refund" && req.method === "POST") {
      return order ? send(200, { order_id: id, refunded: true }) : send(404, { message: `order ${id} does not exist` });
    }

    // Shipping status: a different failure for each order.
    if (sub === "shipping") {
      const n = hit(`shipping:${id}`);
      if (id === "ORD-2002" && n <= 2) return send(503, { message: "shipping service restarting" });
      if (id === "ORD-3003") return send(500, { message: "database connection lost" });
      if (id === "ORD-4004" && n === 1) return send(429, { message: "slow down" }, { "retry-after": "1" });
      if (!order && id !== "ORD-4004") return send(404, { message: `order ${id} does not exist` });
      return send(200, { order_id: id, status: "shipped", carrier: "DHL", eta: "2 days" });
    }
    send(404, { message: "no such route" });
  });

  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }),
    ),
  );
}

// ---- Langfuse helpers -------------------------------------------------------
// Plain calls when Langfuse is off, so the script still runs without keys.

type Obs = {
  update: (attrs: {
    input?: unknown;
    output?: unknown;
    level?: "DEFAULT" | "WARNING" | "ERROR";
    statusMessage?: string;
    metadata?: Record<string, unknown>;
  }) => unknown;
};
const NOOP: Obs = { update: () => undefined };

async function observe<T>(name: string, asType: "tool" | "span", fn: (obs: Obs) => Promise<T>): Promise<T> {
  if (!langfuseEnabled) return fn(NOOP);
  if (asType === "tool") return startActiveObservation(name, (obs) => fn(obs as Obs), { asType: "tool" }) as Promise<T>;
  return startActiveObservation(name, (obs) => fn(obs as Obs)) as Promise<T>;
}

// ---- Tools ------------------------------------------------------------------
// What the model sees: names, descriptions and a JSON schema for the arguments.
// The order id format is left out on purpose, so the 400 scenario can happen.

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_order",
      description: "Look up one order by its id. Returns the item and total.",
      parameters: {
        type: "object",
        properties: { order_id: { type: "string", description: "Order id" } },
        required: ["order_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_shipping_status",
      description: "Get the shipping status of one order by its id.",
      parameters: {
        type: "object",
        properties: { order_id: { type: "string", description: "Order id" } },
        required: ["order_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_orders",
      description: "List all orders of a customer by customer id (format C-100).",
      parameters: {
        type: "object",
        properties: { customer_id: { type: "string", description: "Customer id, for example C-100" } },
        required: ["customer_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "refund_order",
      description: "Refund an order. Amount is in dollars.",
      parameters: {
        type: "object",
        properties: { order_id: { type: "string", description: "Order id" }, amount: { type: "number", description: "Dollars to refund" } },
        required: ["order_id", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_order",
      description: "Permanently delete an order and its history.",
      parameters: {
        type: "object",
        properties: { order_id: { type: "string", description: "Order id" } },
        required: ["order_id"],
      },
    },
  },
];

// ---- Policy -----------------------------------------------------------------
// Rules about what the assistant may do, checked in code before any tool runs. The
// model is told the rules too, but a prompt is a request and this is a lock: a model
// can be talked around, an `if` cannot. The check sees the real arguments, so a rule
// can depend on them (a refund is fine up to a limit).

const REFUND_LIMIT = 50; // dollars the assistant may refund without a human

/** Returns the reason a call is not allowed, or undefined when it may go ahead. */
function checkPolicy(name: string, args: Record<string, unknown>): string | undefined {
  if (name === "delete_order") return "deleting orders is not allowed for this assistant; only support staff can do it";
  if (name === "refund_order" && Number(args.amount) > REFUND_LIMIT) {
    return `refunds above $${REFUND_LIMIT} need manager approval; this assistant may refund up to $${REFUND_LIMIT}`;
  }
  return undefined;
}

/**
 * What a tool hands back to the model. Every failure looks the same, so the model
 * can tell the cases apart without parsing prose:
 *   ok:false, retryable:true   we already retried and gave up; do not try again
 *   ok:false, retryable:false  the request itself is wrong; fix it or tell the user
 * And a successful call that found nothing is ok:true with an empty list: not an error.
 */
type ToolResult =
  | { ok: true; data: unknown; attempts: number }
  | { ok: false; status?: number; kind: string; message: string; retryable: boolean; attempts: number };

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let apiUrl = "";

/** One HTTP call with retries for errors that can go away on their own (5xx, 429). */
async function callApi(path: string, method = "GET"): Promise<ToolResult> {
  for (let attempt = 1; ; attempt++) {
    type Outcome = { done: ToolResult } | { done?: undefined; failure: Extract<ToolResult, { ok: false }>; retryAfter: number };
    const outcome = await observe<Outcome>(`http-attempt ${attempt}`, "span", async (obs) => {
      obs.update({ input: { method, path, attempt } });
      try {
        const res = await fetch(apiUrl + path, { method, signal: AbortSignal.timeout(3000) });
        const body: any = await res.json().catch(() => ({}));
        if (res.ok) {
          obs.update({ output: { status: res.status } });
          return { done: { ok: true, data: body, attempts: attempt } as ToolResult };
        }
        obs.update({
          level: res.status >= 500 ? "ERROR" : "WARNING",
          statusMessage: `HTTP ${res.status}: ${body.message ?? ""}`,
          output: { status: res.status, body },
        });
        const retryAfter = Number(res.headers.get("retry-after")) * 1000 || 0;
        const failure: Extract<ToolResult, { ok: false }> = {
          ok: false,
          status: res.status,
          kind: res.status >= 500 ? "server_error" : res.status === 404 ? "not_found" : "client_error",
          message: body.message ?? res.statusText,
          retryable: RETRYABLE.has(res.status),
          attempts: attempt,
        };
        return { failure, retryAfter };
      } catch (error) {
        // No response at all: network down, connection refused, timeout.
        const message = error instanceof Error ? error.message : String(error);
        obs.update({ level: "ERROR", statusMessage: message });
        const failure: Extract<ToolResult, { ok: false }> = { ok: false, kind: "network_error", message, retryable: true, attempts: attempt };
        return { failure, retryAfter: 0 };
      }
    });

    if (outcome.done) return outcome.done;
    if (!outcome.failure.retryable || attempt >= MAX_ATTEMPTS) return { ...outcome.failure, attempts: attempt };
    await sleep(outcome.retryAfter || BACKOFF_MS * 2 ** (attempt - 1));
  }
}

/** Run the tool the model asked for. Never throws: every outcome becomes a ToolResult. */
async function runTool(name: string, rawArgs: string): Promise<ToolResult> {
  return observe(name, "tool", async (obs) => {
    obs.update({ input: rawArgs });

    let args: Record<string, any>;
    try {
      args = JSON.parse(rawArgs || "{}");
    } catch {
      return finish(obs, { ok: false, kind: "bad_arguments", message: "arguments were not valid JSON", retryable: false, attempts: 0 });
    }

    // Policy first. A blocked call never reaches the API, so there are no http-attempt spans.
    const blocked = checkPolicy(name, args);
    if (blocked) {
      return finish(obs, { ok: false, kind: "policy_blocked", message: blocked, retryable: false, attempts: 0 });
    }

    let result: ToolResult;
    if (name === "refund_order") result = await callApi(`/orders/${encodeURIComponent(args.order_id ?? "")}/refund`, "POST");
    else if (name === "get_order") result = await callApi(`/orders/${encodeURIComponent(args.order_id ?? "")}`);
    else if (name === "get_shipping_status") result = await callApi(`/orders/${encodeURIComponent(args.order_id ?? "")}/shipping`);
    else if (name === "list_orders") result = await callApi(`/orders?customer=${encodeURIComponent(args.customer_id ?? "")}`);
    else result = { ok: false, kind: "unknown_tool", message: `no tool named ${name}`, retryable: false, attempts: 0 };

    return finish(obs, result);
  });
}

/** Record the outcome on the tool span. A failure shows red in Langfuse. */
function finish(obs: Obs, result: ToolResult): ToolResult {
  obs.update({
    output: result,
    ...(result.ok ? {} : { level: (result.kind === "policy_blocked" ? "WARNING" : "ERROR") as "WARNING" | "ERROR", statusMessage: `${result.kind}: ${result.message}` }),
  });
  return result;
}

// ---- The loop ---------------------------------------------------------------
// ask model → if it wants tools, run them and send results → ask again → ... → answer.

const SYSTEM_PROMPT =
  "You are a support assistant for an online shop. Use the tools to answer; never guess order data. " +
  "Tool results are JSON. If ok is true, use data. If data is an empty list, say there is nothing there: that is not an error. " +
  "If ok is false and retryable is false, the request was wrong: if you can fix the arguments from what the user said, call the tool once more, " +
  "otherwise explain the problem and ask the user. " +
  "If ok is false and retryable is true, the service is having trouble and retries were already used: do not call the tool again, " +
  "tell the user plainly that it is temporarily unavailable and share anything you did manage to look up. " +
  "If kind is policy_blocked, a rule forbids this action: do not retry it, do not try to get the same result through another tool, " +
  "explain the rule in plain words and say what the user can do instead.";

async function chat(question: string): Promise<{ answer: string; rounds: number }> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: question },
  ];

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const completion = await client.chat.completions.create({
      model: MODEL,
      max_completion_tokens: 500,
      messages,
      tools: TOOLS,
    });
    const message = completion.choices[0].message;
    messages.push(message);

    const toolCalls = (message.tool_calls ?? []).filter((c) => c.type === "function");
    if (toolCalls.length === 0) return { answer: message.content ?? "", rounds: round };

    // Every tool call needs a reply with its id, even a failed one, or the API rejects the next request.
    for (const call of toolCalls) {
      console.log(`    tool call: ${call.function.name}(${call.function.arguments})`);
      const result = await runTool(call.function.name, call.function.arguments);
      console.log(`    result:    ${result.ok ? "ok" : `${result.kind}${result.status ? ` ${result.status}` : ""}`}, ${result.attempts} attempt(s)`);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { answer: "(stopped: the model kept asking for tools)", rounds: MAX_ROUNDS };
}

// ---- Scenarios --------------------------------------------------------------

const SCENARIOS: { name: string; what: string; question: string }[] = [
  {
    name: "success",
    what: "Baseline: the call works. Look at the two generations and the tool span between them.",
    question: "What did I buy in order ORD-1001 and how much was it?",
  },
  {
    name: "404-not-found",
    what: "API says 404. Not retryable: the thing does not exist. The model should say so, not invent an order.",
    question: "What is in order ORD-9999?",
  },
  {
    name: "400-bad-input",
    what: "API says 400: the id has the wrong format. Not retryable as is, but the model can fix it from the user's words.",
    question: "What did I buy in order 1001? I only remember the number.",
  },
  {
    name: "empty-result",
    what: "API says 200 with an empty list. Success, but nothing found: no error, and no retry.",
    question: "List all orders for customer C-200.",
  },
  {
    name: "503-recovers",
    what: "API says 503 twice, then works. The tool retries by itself; the model never sees the failure.",
    question: "What is the shipping status of ORD-2002?",
  },
  {
    name: "500-gives-up",
    what: "API says 500 every time. Retries run out, the model is told, and should report it without making up a status.",
    question: "Give me the item and the shipping status for ORD-3003.",
  },
  {
    name: "429-rate-limit",
    what: "API says 429 with Retry-After. The tool waits as told, then succeeds.",
    question: "What is the shipping status of ORD-4004?",
  },
  {
    name: "policy-blocked-always",
    what: "The user asks for an action the assistant is never allowed to take. Policy blocks it before the API is called.",
    question: "Please delete order ORD-1001, I don't want it on my account.",
  },
  {
    name: "policy-blocked-limit",
    what: "A refund over the limit: the same tool as the next scenario, but policy blocks this amount.",
    question: "Refund $89 for order ORD-1001, the keyboard arrived broken.",
  },
  {
    name: "policy-allowed",
    what: "Control: a refund within the limit passes policy and runs. Compare its trace with the blocked one.",
    question: "Refund $20 for order ORD-1001, the box was damaged.",
  },
];

// ---- Main -------------------------------------------------------------------

if (!process.env.LITELLM_MASTER_KEY) {
  console.error("LITELLM_MASTER_KEY is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const only = process.argv[2];
const selected = only ? SCENARIOS.filter((s) => s.name.includes(only)) : SCENARIOS;
if (selected.length === 0) {
  console.error(`No scenario matches "${only}". Choose from: ${SCENARIOS.map((s) => s.name).join(", ")}`);
  process.exit(1);
}

startLangfuse();
const api = await startApi();
apiUrl = api.baseUrl;

try {
  for (const scenario of selected) {
    calls.clear(); // each scenario starts with a fresh API
    console.log(`\n== ${scenario.name}: ${scenario.what}`);
    console.log(`  user: ${scenario.question}`);

    const run = async () => {
      const { answer, rounds } = await chat(scenario.question);
      console.log(`  answer (${rounds} model call${rounds === 1 ? "" : "s"}): ${answer.trim()}`);
      return answer;
    };

    if (langfuseEnabled) {
      const traceName = `tool-calls: ${scenario.name}`;
      await propagateAttributes({ traceName }, () =>
        startActiveObservation(traceName, async (root) => {
          root.update({ input: scenario.question });
          root.update({ output: await run() });
        }),
      );
    } else {
      await run();
    }
  }
} catch (error) {
  console.error("Tools demo failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  api.server.close();
  await stopLangfuse();
}
