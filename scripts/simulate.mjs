#!/usr/bin/env node
// Plays the role of the support agent: posts live traces (and the odd escalation)
// to the API, so you can watch the dashboard update.
//
//   node scripts/simulate.mjs                 # 30 turns, one every 300ms
//   node scripts/simulate.mjs --turns 100 --delay 500   # stays under the 120/min ingest limit
//   node scripts/simulate.mjs --url http://localhost:4000 --key dev-ingest-key

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1]]);
    return pairs;
  }, []),
);
const URL = args.url ?? process.env.API_URL ?? "http://localhost:4000";
const KEY = args.key ?? process.env.INGEST_API_KEY ?? "dev-ingest-key";
const TURNS = Number(args.turns ?? 30);
const DELAY = Number(args.delay ?? 300);

const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body) {
  const res = await fetch(`${URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

let session = `sim-${Date.now().toString(36)}`;
let sent = 0;
let escalated = 0;

for (let i = 0; i < TURNS; i++) {
  if (Math.random() < 0.3) session = `sim-${Date.now().toString(36)}-${i}`;
  const language = pick(["en", "en", "hinglish", "hinglish", "hi"]);
  const tools = [pick(["track_order", "search_products", "search_policies"])];
  const escalate = Math.random() < 0.08;
  if (escalate) tools.push("escalate_to_human");

  const input_tokens = 900 + Math.round(Math.random() * 1200);
  const output_tokens = 60 + Math.round(Math.random() * 160);
  await post("/api/traces", {
    session_id: session,
    language,
    tools,
    latency_ms: Math.round(700 + Math.random() * 2200),
    input_tokens,
    output_tokens,
    cost_usd: Number(((input_tokens * 0.15 + output_tokens * 0.6) / 1e6).toFixed(6)),
    repaired: Math.random() < 0.03,
  });
  sent++;

  if (escalate) {
    await post("/api/escalations", {
      session_id: session,
      customer_name: pick(["Aisha", "Varun", "Tanvi", "Kabir"]),
      phone_last4: String(1000 + Math.floor(Math.random() * 9000)),
      order_id: `NN${1000 + Math.floor(Math.random() * 999)}`,
      reason: "Simulated: customer asked for a human after a delayed delivery",
      category: "order",
      language,
      transcript: [
        { role: "customer", body: "Order abhi tak nahi aaya, kisi se baat karni hai" },
        { role: "agent", body: "Sorry for the delay! Main aapko hamari team se connect kar rahi hoon." },
      ],
    });
    escalated++;
  }
  if (DELAY) await sleep(DELAY);
}

console.log(`Sent ${sent} traces and ${escalated} escalations to ${URL}`);
