# Temperature and output generation parameters

> The model outputs a probability for every possible next token; temperature, top-p, top-k and the other generation parameters only decide how one token is picked from that list — so they control randomness and length, not what the model knows.

## Why it matters

The same prompt can give a different answer each time, and that is a setting, not a bug. Extraction, classification and tool calls usually want the most likely answer every time. Brainstorming and writing want variety. Knowing which knob does what lets you choose on purpose instead of copying defaults — and tells you which problems a knob cannot fix (a wrong fact stays wrong at any temperature).

## How it works

Generation is a loop (step 10 in [LLM architecture basics](architecture-basics.md)). Each pass the model produces one **logit** (raw score) per token in the vocabulary. The parameters act in this order:

```
logits → ÷ temperature → softmax → top-k / top-p cut → pick one token → append → repeat
```

### Greedy vs sampling

- **Greedy decoding** always takes the highest-probability token. Predictable, but can be repetitive or dull.
- **Sampling** picks randomly, weighted by the probabilities: a token with 60% is chosen about 60% of the time. Temperature, top-k and top-p all shape this lottery.

### Temperature

Before softmax, every logit is divided by the temperature `T`:

```
probability of token i = exp(logit_i / T) / sum over all tokens of exp(logit_j / T)
```

- **Low T (< 1)** makes the gaps between scores bigger, so the top token takes more of the probability. More focused and repeatable.
- **T = 1** leaves the model's own distribution unchanged.
- **High T (> 1)** shrinks the gaps, so unlikely tokens get a real chance. More varied, and more likely to drift or produce nonsense.
- **T → 0** is the same as greedy. Many APIs treat `0` as "pick the top token".

Temperature does not add creativity or knowledge. It only reshapes the odds over tokens the model already considered.

### Top-k and top-p (nucleus sampling)

Both remove the unlikely tail, then renormalise the rest so they add up to 100% again.

- **Top-k**: keep only the `k` most likely tokens. Simple, but `k` is blind to the situation: 50 may be too many when the model is sure and too few when it is not.
- **Top-p**: keep the smallest set of top tokens whose probabilities add up to at least `p` (e.g. 0.9). The set grows when the model is unsure and shrinks when it is confident.
- **Min-p** (offered by some open-model servers): keep tokens whose probability is at least a fraction of the top token's.

Top-p and temperature both control randomness, so the usual advice is to **change one and leave the other at its default**.

### Other output parameters

| Parameter | What it does |
| --- | --- |
| Max output tokens | Hard cap on length. If hit, the answer is cut off mid-sentence (the stop reason says so). It does not make the model write shorter, only stops it. |
| Stop sequences | Strings that end generation as soon as they appear, e.g. `"\n\n"` or `"###"`. |
| Frequency penalty | Lowers a token's score more each time it has already appeared, which reduces repetition. |
| Presence penalty | Lowers a token's score once it has appeared at all, which pushes towards new topics. |
| Seed | Asks for repeatable sampling. Best-effort only, and not offered everywhere. |
| Logprobs | Returns the probabilities of the chosen (and runner-up) tokens, useful for checking confidence. |
| n (number of completions) | Returns several samples for one prompt, e.g. to pick the best or vote. Costs for all of them. |

Which parameters exist, their allowed ranges and their defaults differ by provider and by model, and some newer reasoning models fix or reject temperature and top-p. Check the docs for the model you call.

## Example

Next-token logits after `The cat sat` (made-up numbers):

| Token | Logit | T = 0.5 | T = 1 | T = 2 |
| --- | --- | --- | --- | --- |
| ` on` | 3.0 | 86.5% | 64.4% | 45.5% |
| ` down` | 2.0 | 11.7% | 23.7% | 27.6% |
| ` up` | 1.0 | 1.6% | 8.7% | 16.7% |
| ` away` | 0.0 | 0.2% | 3.2% | 10.2% |

Working for T = 1: `exp(3)=20.09`, `exp(2)=7.39`, `exp(1)=2.72`, `exp(0)=1`, total 31.20, so ` on` = 20.09 ÷ 31.20 = 64.4%. For T = 0.5, divide the logits by 0.5 first (6, 4, 2, 0), and ` on` becomes 403.4 ÷ 466.4 = 86.5%.

Now cut the tail at T = 1:

- **Top-k = 2** keeps ` on` and ` down`: 64.4 ÷ 88.1 = 73.1% and 26.9%.
- **Top-p = 0.9**: running total 64.4%, 88.1%, 96.8% — it must reach 90%, so ` on`, ` down` and ` up` stay. Renormalised: 66.5%, 24.5%, 9.0%. ` away` can no longer be picked.

Starting points by task (adjust by testing, not as rules):

| Task | Temperature | Why |
| --- | --- | --- |
| Data extraction, classification, JSON, tool calls | 0 – 0.2 | You want the same, most likely answer |
| Q&A over documents, code | 0 – 0.5 | Accuracy first, small wording variation is fine |
| Chat, drafting, summaries | 0.5 – 1 | Natural phrasing |
| Brainstorming, names, story ideas | 1 or a little above, if the provider allows | Variety is the point |

## Gotchas

- **Temperature 0 is not guaranteed identical output.** Floating-point rounding, GPU batching and provider-side changes can still flip a close call between two tokens, and after that the rest of the text diverges. Treat it as "very repeatable", and test with a fixed set of prompts rather than relying on it.
- **Lower temperature does not stop hallucination.** It makes the model more consistently confident, including when it is wrong. Fixing accuracy takes better context, retrieval or checks.
- **Higher temperature is not "more creative" in a controlled way.** It spreads probability over bad tokens as well as interesting ones, and one odd token early can derail the rest.
- **Don't tune temperature and top-p together.** Their effects overlap and are hard to untangle; some providers reject setting both.
- **Penalties can hurt.** Frequency and presence penalties also penalise tokens that *should* repeat, such as code identifiers, JSON keys and names.
- **A cut-off answer is a max-tokens problem, not a temperature one.** Check the stop reason first. Remember output tokens are the expensive and slow side (see [Tokens, tokenization and the context window](tokens-and-context-window.md)).
- **Structured output beats a low temperature for format.** If you need valid JSON, use the provider's schema or JSON mode rather than hoping temperature 0 keeps the braces right.

## Revise

Questions to answer from memory when coming back to this note.

**Concepts**

1. What does the model actually output at each step, and where do the sampling parameters act on it?
2. What does dividing the logits by a temperature below 1 do to the probabilities? Above 1?
3. What is the difference between top-k and top-p, and why is top-p usually the better cut?
4. Why is it advised to change temperature or top-p, but not both?
5. Why can temperature 0 still give slightly different outputs on repeated calls?
6. What is the difference between max output tokens and asking the model for a short answer?
7. What do frequency and presence penalties do, and when would they backfire?

**Calculations**

8. Logits are `A = 2`, `B = 1`, `C = 0` at T = 1. What are the three probabilities? (Use `exp(2)=7.39`, `exp(1)=2.72`.)
9. Using the same logits, with top-p = 0.8, which tokens stay and what are their renormalised probabilities?

<details>
<summary>Answers to 8–9</summary>

8. Total = 7.39 + 2.72 + 1 = 11.11, so A = **66.5%**, B = **24.5%**, C = **9.0%**
9. Running total: A 66.5%, then A + B 91.0% ≥ 80%, so **A and B** stay. Renormalised: A = 66.5 ÷ 91.0 = **73.1%**, B = **26.9%**

</details>

**Engineering judgment**

10. You extract invoice fields into JSON. Which settings would you choose, and what would you add besides temperature?
11. A chatbot keeps starting every reply the same way. Which knob would you try first, and what would you check before touching sampling at all?
12. A user reports the model gave a different answer to the same question yesterday. How do you decide whether that is a bug?

## See also

- [LLM architecture basics](architecture-basics.md) — steps 8 (predict) and 10 (generate), where these parameters apply
- [Tokens, tokenization and the context window](tokens-and-context-window.md) — max output tokens, and why output is the costly side
- [System, user and assistant roles](../prompting/system-user-assistant-roles.md) — the prompt side of controlling output
