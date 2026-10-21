/**
 * Generates realistic demo data for Neem & Nest, the fictional D2C store from
 * d2c-support-agent: two weeks of agent traces plus the conversations it escalated.
 * Deterministic, so the demo looks the same on every machine.
 */
import type { Category, Priority, Status } from "./validation";

type Lang = "en" | "hi" | "hinglish";

export interface SeedTrace {
  session_id: string;
  language: Lang;
  tools: string[];
  flags: string[];
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  repaired: boolean;
  fallback: boolean;
  at: string;
}

export interface SeedTicket {
  session_id: string;
  customer_name: string;
  phone_last4: string;
  order_id: string | null;
  reason: string;
  category: Category;
  priority: Priority;
  status: Status;
  language: Lang;
  assignee: string | null;
  created_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  messages: { role: "customer" | "agent" | "human" | "note"; author: string; body: string; at: string }[];
}

// Token prices for a small tool-calling model, USD per 1M tokens.
const PRICE_IN = 0.15;
const PRICE_OUT = 0.6;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = [
  "Priya", "Rahul", "Ananya", "Vikram", "Sneha", "Arjun", "Meera", "Karan", "Pooja", "Aditya",
  "Neha", "Rohit", "Ishita", "Siddharth", "Kavita", "Manish", "Riya", "Harsh", "Divya", "Nikhil",
];
const AGENTS = ["Aarti", "Rohan", "Kavya"];

interface Scenario {
  category: Category;
  priority: Priority;
  language: Lang;
  reason: string;
  needsOrder: boolean;
  customer: string[];
  agent: string[];
  human: string;
}

const SCENARIOS: Scenario[] = [
  {
    category: "damaged",
    priority: "high",
    language: "hinglish",
    reason: "Damaged item: Vitamin C + Amla Serum bottle arrived broken and leaked",
    needsOrder: true,
    customer: ["Mera Vitamin C serum ka bottle toota hua aaya hai, poora leak ho gaya 😡", "Photo bhej di hai. Mujhe replacement chahiye jaldi"],
    agent: [
      "Bahut sorry ki aapka serum aisa pahuncha. Damaged item ke liye 48 ghante ke andar photo share kar dijiye, hum free replacement ya full refund dete hain.",
      "Photo mil gayi, shukriya. Main aapko hamari team se connect kar rahi hoon, woh replacement process kar denge.",
    ],
    human: "Hi! Replacement dispatch ho gaya hai, tracking link SMS pe bheja hai. Sorry for the trouble 🙏",
  },
  {
    category: "order",
    priority: "medium",
    language: "hinglish",
    reason: "Shipment stuck in transit for 5 days, customer wants an update from the courier",
    needsOrder: true,
    customer: ["Order 5 din se 'in transit' dikha raha hai, kab aayega?", "Ye jawab pichli baar bhi mila tha. Kisi insaan se baat karao"],
    agent: [
      "Aapka order Delhivery ke saath in transit hai. Courier ka last update 3 din pehle ka hai, expected delivery thodi delay ho sakti hai.",
      "Samajh sakti hoon. Main ye conversation hamari support team ko de rahi hoon, woh courier se direct baat karenge.",
    ],
    human: "Courier se baat ho gayi, aapka parcel kal out for delivery hoga. Main track kar rahi hoon.",
  },
  {
    category: "refund",
    priority: "urgent",
    language: "en",
    reason: "COD refund not received 10 days after return; customer has asked three times",
    needsOrder: true,
    customer: ["I returned my COD order 10 days ago and still no refund. This is the third time I'm asking!!"],
    agent: [
      "I'm sorry about the delay. COD refunds are paid by bank transfer or UPI within 5-7 working days after we receive your details. Since it's been longer, I'm escalating this to our team right away.",
    ],
    human: "Apologies for the wait. Your refund of ₹878 was sent to your UPI ID today; it should reflect within a few hours.",
  },
  {
    category: "product",
    priority: "high",
    language: "hinglish",
    reason: "Customer reports rashes after using a face wash; medical question the agent must not answer",
    needsOrder: false,
    customer: ["Neem & Tulsi face wash use karne ke baad face pe rashes ho gaye. Kya lagaun?"],
    agent: [
      "Sorry to hear this. Main medical advice nahi de sakti, please product use karna band kijiye aur dermatologist se consult kijiye. Main aapko hamari team se connect kar rahi hoon taaki woh aapki help kar sakein.",
    ],
    human: "Hope you're feeling better. We've arranged a full refund, and our formulation team would like to know the batch number if you still have the box.",
  },
  {
    category: "order",
    priority: "medium",
    language: "en",
    reason: "Wrong item delivered: received Anti-Dandruff Neem Shampoo instead of Onion & Reetha Shampoo",
    needsOrder: true,
    customer: ["I ordered Onion & Reetha Shampoo but got Anti-Dandruff Neem Shampoo instead"],
    agent: [
      "Sorry about the mix-up! For a wrong item, please share a photo within 48 hours of delivery and we'll send the right product free. I'm handing this to our team to arrange it.",
    ],
    human: "The correct shampoo is on its way and no need to return the other one. Enjoy it on us!",
  },
  {
    category: "order",
    priority: "medium",
    language: "hi",
    reason: "Customer wants to cancel an order that has already shipped",
    needsOrder: true,
    customer: ["मेरा ऑर्डर कैंसिल करना है लेकिन वो शिप हो गया है"],
    agent: [
      "शिप होने के बाद ऑर्डर कैंसिल नहीं हो सकता, लेकिन डिलीवरी के 7 दिन के अंदर बिना खोले प्रोडक्ट रिटर्न कर सकते हैं। मैं आपको हमारी टीम से जोड़ रही हूँ।",
    ],
    human: "नमस्ते! हमने कूरियर को RTO के लिए बोल दिया है, रिफंड 5-7 दिन में आ जाएगा।",
  },
  {
    category: "policy",
    priority: "low",
    language: "hinglish",
    reason: "Change delivery address after the order shipped",
    needsOrder: true,
    customer: ["Delivery address change karna hai, galti se purana address daal diya"],
    agent: [
      "Order ship ho chuka hai, isliye address change guaranteed nahi hai. Main hamari team ko bol rahi hoon ki woh courier ke saath try karein.",
    ],
    human: "Courier ne naya address update kar diya hai ✅",
  },
  {
    category: "other",
    priority: "low",
    language: "en",
    reason: "Customer asked to speak to a human about a bulk order for a wedding",
    needsOrder: false,
    customer: ["Can I talk to a person? I want to order 40 gift kits for a wedding"],
    agent: ["Of course! Bulk orders are handled by our team directly, so I'm connecting you now."],
    human: "Congratulations! We can do 40 kits with custom tags, I've emailed you a quote.",
  },
];

/** Generate the demo dataset relative to `now`. */
export function generateSeed(now: Date = new Date(), days = 14, seed = 42) {
  const rand = mulberry32(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const iso = (ms: number) => new Date(ms).toISOString();
  const MIN = 60_000;

  const traces: SeedTrace[] = [];
  const tickets: SeedTicket[] = [];
  const nowMs = now.getTime();
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let sessionNo = 1000;

  for (let d = days - 1; d >= 0; d--) {
    const start = dayStart - d * 24 * 60 * MIN;
    const weekday = new Date(start).getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const sessions = Math.round(between(isWeekend ? 28 : 40, isWeekend ? 45 : 70));

    for (let s = 0; s < sessions; s++) {
      // Indian traffic: mostly 9:00-23:00 IST, which is 03:30-17:30 UTC.
      let t = start + between(3.5 * 60, 17.5 * 60) * MIN;
      if (t > nowMs - 25 * MIN) continue; // leave room for the session's later turns

      const session_id = `wa-${++sessionNo}`;
      const escalate = rand() < 0.085;
      const sc = escalate ? pick(SCENARIOS) : null;
      const r = rand();
      const language: Lang = sc ? sc.language : r < 0.45 ? "en" : r < 0.85 ? "hinglish" : "hi";
      const turns = 1 + Math.floor(rand() * 4);

      for (let turn = 0; turn < turns; turn++) {
        const intent = rand();
        const tools: string[] = [];
        if (intent < 0.45) tools.push("track_order");
        else if (intent < 0.72) tools.push("search_products");
        else if (intent < 0.9) tools.push("search_policies");
        if (escalate && turn === turns - 1) tools.push("escalate_to_human");

        const repaired = rand() < 0.03;
        const fallback = repaired && rand() < 0.3;
        const flags: string[] = [];
        if (repaired) flags.push("price_grounding");
        if (rand() < 0.006) flags.push("injection_attempt");

        // Right-skewed latency: most turns ~1-2s, a tail past 4s.
        const base = 650 + Math.exp(between(6.2, 7.6));
        const latency = Math.round(base + tools.length * between(180, 520) + (repaired ? between(900, 1800) : 0));
        const input_tokens = Math.round(between(950, 1900) + tools.length * between(250, 700));
        const output_tokens = Math.round(between(55, 210) * (language === "hi" ? 1.6 : 1));
        const cost = (input_tokens * PRICE_IN + output_tokens * PRICE_OUT) / 1_000_000;

        traces.push({
          session_id,
          language,
          tools,
          flags,
          latency_ms: latency,
          input_tokens,
          output_tokens,
          cost_usd: Math.round(cost * 1e6) / 1e6,
          repaired,
          fallback,
          at: iso(t),
        });
        t += between(0.5, 4) * MIN;
      }

      if (sc) {
        const name = pick(NAMES);
        const createdMs = t;
        const messages: SeedTicket["messages"] = [];
        let mt = createdMs - (sc.customer.length + sc.agent.length) * 1.2 * MIN;
        for (let i = 0; i < Math.max(sc.customer.length, sc.agent.length); i++) {
          if (sc.customer[i]) messages.push({ role: "customer", author: name, body: sc.customer[i], at: iso((mt += 0.8 * MIN)) });
          if (sc.agent[i]) messages.push({ role: "agent", author: "Neha (AI)", body: sc.agent[i], at: iso((mt += 0.4 * MIN)) });
        }

        tickets.push({
          session_id,
          customer_name: name,
          phone_last4: String(1000 + Math.floor(rand() * 9000)),
          order_id: sc.needsOrder ? `NN${1100 + Math.floor(rand() * 900)}` : null,
          reason: sc.reason,
          category: sc.category,
          priority: sc.priority,
          status: "open",
          language: sc.language,
          assignee: null,
          created_at: iso(createdMs),
          first_response_at: null,
          resolved_at: null,
          messages,
          _scenario: sc,
        } as SeedTicket & { _scenario: Scenario });
      }
    }
  }

  // Newest escalations are still in the queue; older ones were picked up and resolved.
  // Done by recency rank so the demo always has a live queue, whatever time it is seeded.
  const byNewest = [...tickets].sort((a, b) => b.created_at.localeCompare(a.created_at));
  byNewest.forEach((ticket, rank) => {
    const sc = (ticket as SeedTicket & { _scenario: Scenario })._scenario;
    delete (ticket as Partial<SeedTicket & { _scenario: Scenario }>)._scenario;
    const status: Status = rank < 5 ? "open" : rank < 9 ? "in_progress" : "resolved";
    ticket.status = status;
    if (status === "open") return;

    const createdMs = Date.parse(ticket.created_at);
    const assignee = pick(AGENTS);
    const urgent = sc.priority === "urgent" || sc.priority === "high";
    const respondedMs = Math.min(createdMs + (urgent ? between(4, 35) : between(15, 140)) * MIN, nowMs - MIN);
    ticket.assignee = assignee;
    ticket.first_response_at = iso(respondedMs);
    ticket.messages.push({ role: "note", author: assignee, body: "Picked up. Checking the order and courier details.", at: iso(respondedMs - 0.5 * MIN) });
    ticket.messages.push({ role: "human", author: assignee, body: sc.human, at: ticket.first_response_at });
    if (status === "resolved") ticket.resolved_at = iso(Math.min(respondedMs + between(20, 600) * MIN, nowMs - MIN));
  });

  return { traces, tickets };
}
