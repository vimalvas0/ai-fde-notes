# Function calls and tool-call errors

> The model never runs a tool; it only asks for one, your code runs it and hands back the result, and when the tool fails that result message is the only way the model finds out, so the shape of your error decides whether it recovers, retries or makes something up.

## Why it matters

A tool call is where the model touches the real world: an API, a database, a refund. Real systems fail all the time. An API is down, an id is wrong, a record does not exist, a rule says no. If you handle these badly, the model may repeat a call that cannot work, give up too early, or the worst case: invent an answer that looks real. Handling errors well is most of what makes a tool-using assistant safe to trust.

## How it works

### The function-call loop

The model cannot call your API. It can only write a message that says "please call `get_order` with `order_id = ORD-1001`". Your code does the rest:

```
1. You send:   the question + a list of tools (name, description, argument schema)
2. Model says: "call get_order({order_id: ORD-1001})"      ← a request, nothing ran yet
3. Your code:  runs the real function
4. You send:   the result back as a "tool" message
5. Model says: the final answer in plain words
```

Steps 2 to 4 can repeat. Always set a maximum number of rounds so a confused model cannot loop forever.

Two rules about step 4:

- **Every tool call must get a reply**, even a failed one. If a call has no matching `tool` message, the next request to the model is rejected.
- **Errors are just results.** A failed tool is not an exception that stops the program. It is a message the model reads and acts on.

### Who should handle the error

Ask one question first: **what caused it, and who can fix it?**

| Who fixes it | When | Examples |
| --- | --- | --- |
| **Your code** | The problem can go away by itself | 5xx, 429, timeout |
| **The model** | The request was wrong, and it can correct it | 400 bad format, invalid JSON arguments |
| **The user** | Something is missing or not allowed | 404, policy block |
| **Nobody** | It worked, there is just nothing there | Empty result |

### The model can send wrong arguments

Yes, it happens. The model writes the arguments as text, and nothing forces that text to be correct unless you turn on a strict mode. Your schema guides the model but does not enforce anything.

| Problem | Example |
| --- | --- |
| Wrong format | `"1001"` instead of `"ORD-1001"` |
| Wrong type | `amount: "twenty"` instead of `20` |
| Missing required field | `get_order({})` |
| Invalid JSON | A cut-off string, a trailing comma |
| Made-up value | An id the user never gave |
| Wrong tool | `get_order` when the user wanted shipping |
| Unknown tool name | A tool that does not exist |

Why it happens: the model fills gaps by guessing, descriptions are vague, the user did not give the needed information, or there are many similar tools. In the demo the order-id format is left out of the tool description on purpose, and the model sends `1001`.

What to do:

1. **Put the format in the schema**: examples, patterns, `enum` for fixed choices, and "ask the user if you do not know, never guess".
2. **Validate in code before running the tool**: types, required fields, format. The demo only checks that the JSON parses and lets the API reject a bad id; a real tool should check the schema itself.
3. **Return a useful error message.** `order id must look like ORD-1234, got "1001"` lets the model fix the call. A bare "400" does not.
4. **Allow one fix attempt**, then ask the user. The round cap stops loops.
5. **Use strict or structured tool calling** if your provider has it. It removes wrong types and missing fields, but cannot catch a well-formed wrong value.
6. **Be most careful with writes.** A wrong read is a 404; a wrong refund or delete does real damage. Add policy limits and ask the user to confirm risky actions.

The dangerous case is a well-formed but wrong value, such as the right type with the wrong order id. No schema catches it. Only the API's own checks, a policy rule or a confirmation from the user will.

### The error types

| Type | Example | Retry? | What to do |
| --- | --- | --- | --- |
| Server error | 500, 502, 503, 504 | Yes, in code | Retry with growing waits, up to a cap (3 tries). If still failing, tell the model `retryable: true`. The model tells the user the service is down and shares any partial results. |
| Rate limit | 429 | Yes, in code | Wait as long as the `Retry-After` header says, then retry. |
| No response | Timeout, connection refused | Yes, in code | Same as a server error. Always set a timeout so one hung call cannot freeze the loop. |
| Bad input | 400, wrong id format | Not the same call | Send the API's message to the model. It fixes its arguments and calls once more. If it cannot, it asks the user. |
| Not found | 404 | No | Do not retry and do not invent data. The model says it does not exist and asks the user to check. |
| Policy block | Delete an order, refund over the limit | No | Block in code before the API is called. The model explains the rule and offers what is allowed. |
| Empty result | 200 with an empty list | No | This is not an error. Return success with empty data. The model says "nothing found". |
| Bad arguments | The model wrote invalid JSON | Model fixes | Return an error saying the arguments were not valid JSON. |
| Unknown tool | The model asked for a tool that does not exist | No | Return an error so the model picks a real tool. |

Two more cases to handle in a real system:

- **401 / 403 (not logged in, not allowed).** Retrying will not help. This is a setup problem on your side. Tell the user something is wrong and do not let the model keep guessing.
- **A 200 with a broken body** (missing fields). Check the response inside the tool and return an error, instead of passing garbage to the model.

### The decision rule

1. Can it fix itself? (5xx, 429, network) → **code retries**. The model hears about it only after the retries run out.
2. Is the request wrong? (400, bad JSON) → **model fixes the arguments**, once.
3. Is the thing missing or forbidden? (404, policy) → **no retry**. The model explains it to the user.
4. Did it work but return nothing? → say "nothing found". It is **not an error**.

### One error shape for every failure

Return the same JSON every time, so the model decides from fields and not by reading sentences:

```json
{ "ok": false, "kind": "server_error", "status": 500,
  "message": "database connection lost", "retryable": true, "attempts": 3 }
```

- `retryable: true` means "we already retried and gave up, do not call again, tell the user it is unavailable".
- `retryable: false` means "the request is wrong or not allowed, fix it or tell the user".

### Policy goes in code, not only in the prompt

You can tell the model "never delete orders" in the system prompt, but a prompt is a request. A clever message can talk a model around it. A rule written as an `if` in your code cannot be talked around, and it can look at the real arguments (a refund is fine up to $50, blocked above). So check policy in code before the tool runs, and also tell the model, so it can explain the block well.

## Example

The runnable version is in [Model router](../../apps/model-router/README.md) (`npm run tools`). It starts a small fake API and asks one question per failure:

| Question | What the API does | What happens |
| --- | --- | --- |
| "What is in order ORD-9999?" | 404 | The model says the order does not exist and asks the user to check the number. It invents nothing. |
| "What did I buy in order 1001?" | 400, "id must look like ORD-1234" | The model sent `1001`, read the message, then called again with `ORD-1001`. |
| "List orders for customer C-200" | 200, empty list | The model says there are no orders. No error, no retry. |
| "Shipping status of ORD-2002?" | 503, 503, then 200 | The code retried twice and the third try worked. The model never saw a failure. |
| "Shipping status of ORD-3003?" | 500 every time | After 3 tries the model got `retryable: true`. It reported the outage and still shared the item it had found. |
| "Delete order ORD-1001" | Blocked by policy | The API was never called (0 attempts). The model said only support staff can delete orders. |
| "Refund $89 for ORD-1001" | Blocked by policy (limit $50) | Same block, decided from the amount. A $20 refund runs normally. |

In Langfuse each question is one trace: a model call whose output is the tool call, a `tool` entry with the arguments and exactly what the model received, one `http-attempt` per try, then the second model call. Failed tries and failed tools show as `ERROR`. A policy block shows as `WARNING`, because nothing broke and the rule did its job.

## Gotchas

- **The model can invent data after a failed lookup.** Without clear instructions it may fill the gap with something plausible. Say in the system prompt: never guess, and say what to do for each error kind.
- **Retrying a 4xx does not help.** The request is wrong, so it fails the same way every time. Retry only errors that can go away on their own.
- **Retrying everything blindly makes outages worse.** Cap the tries and wait longer each time (200 ms, 400 ms, ...).
- **Two layers of retry multiply.** If your code retries 3 times and the model retries 3 times, one failure becomes 9 calls. Let the code retry, and tell the model not to.
- **Retrying a write can do it twice.** Retrying a refund after a timeout may refund twice if the first one went through. Retry reads freely; for writes, use an idempotency key or do not retry.
- **Empty is not an error.** If you return an error for an empty list, the model may tell the user something broke when nothing did.
- **A policy that checks one call at a time misses totals.** Two refunds of $45 each pass a $50 limit. Track running totals if that matters.
- **Always cap model rounds**, so a model that keeps asking for tools cannot loop forever.

## Revise

Questions to answer from memory when coming back to this note.

1. Who actually runs a tool, the model or your code? What does the model send?
2. Why must a failed tool call still get a reply message?
3. Which errors should your code retry, and which should not? Why is retrying a 400 pointless?
4. What does `retryable: true` tell the model to do? What about `retryable: false`?
5. A search returns 200 with an empty list. Is that an error? What should the model say?
6. A 404 comes back. What should the model do, and what must it not do?
7. Why enforce a policy in code and not only in the system prompt?
8. In Langfuse, why is a policy block a `WARNING` and a 500 an `ERROR`?
9. Why is retrying a refund after a timeout risky?
10. Name two caps that stop a tool loop from running forever.
11. Can the model send wrong arguments? Name three ways, and say which one a schema cannot catch.
12. Why should an error message say what the right format is, and not just "invalid"?

## See also

- App: [Model router](../../apps/model-router/README.md) (`npm run tools`, with `--chat` to type your own prompts)
- Diagram: none yet
- Sources: [Model router tools demo](../../apps/model-router/src/tools-demo.ts)
