// npm run usage            totals per user
// npm run usage <user>     every request by that user, plus their total
// add `-- --json` to either for machine-readable output

import { getUsage, getUsageByUser, sumUsage } from "./store.ts";

const args = process.argv.slice(2);
const json = args.includes("--json");
const user = args.find((a) => !a.startsWith("--"));

if (user) {
  const records = getUsage(user);
  const totals = sumUsage(records);
  if (json) {
    console.log(JSON.stringify({ user, totals, records }, null, 2));
  } else if (records.length === 0) {
    console.log(`No usage recorded for "${user}".`);
  } else {
    console.table(
      records.map((r) => ({
        time: r.timestamp,
        model: r.model,
        input: r.inputTokens,
        output: r.outputTokens,
        total: r.totalTokens,
      })),
    );
    console.log(`${user}: ${totals.inputTokens} input + ${totals.outputTokens} output = ${totals.totalTokens} tokens over ${totals.requests} request(s)`);
  }
} else {
  const byUser = getUsageByUser();
  if (json) {
    console.log(JSON.stringify(byUser, null, 2));
  } else if (Object.keys(byUser).length === 0) {
    console.log('No usage recorded yet. Run: npm run ask <user> "<prompt>"');
  } else {
    console.table(byUser);
  }
}
