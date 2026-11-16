// npm run cost <user>   total cost spent by that user
// npm run cost          total cost for every user
// add `-- --json` for machine-readable output

import { summariseCost } from "./pricing.ts";
import { getUsage } from "./store.ts";

const args = process.argv.slice(2);
const json = args.includes("--json");
const user = args.find((a) => !a.startsWith("--"));

const usd = (n: number) => `$${n.toFixed(6)}`;

const records = getUsage(user);
if (records.length === 0) {
  console.log(user ? `No usage recorded for "${user}".` : "No usage recorded yet.");
  process.exit(0);
}

const users = user ? [user] : [...new Set(records.map((r) => r.user))];
const rows = users.map((name) => ({ user: name, ...summariseCost(records.filter((r) => r.user === name)) }));

if (json) {
  console.log(JSON.stringify(user ? rows[0] : rows, null, 2));
} else if (user) {
  const s = rows[0];
  console.log(`${user}: ${usd(s.costUsd)} over ${s.requests} request(s), ${s.cacheHits} answered from cache (free)`);
} else {
  console.table(rows.map((r) => ({ ...r, costUsd: usd(r.costUsd) })));
}
if (rows.some((r) => r.unpricedRequests > 0)) {
  console.warn("Some requests used a model that is not in src/pricing.ts and are not counted.");
}
