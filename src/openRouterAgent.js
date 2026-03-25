import OpenAI from "openai";
import { buildSearchPlan, getStateTreasuryUrl } from "./searcher.js";
import { matchAndRank } from "./matcher.js";

async function tavilySearch(query, apiKey) {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: 3,
        include_answer: false,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((r) => ({
      title: r.title || "",
      url: r.url || "",
      snippet: r.content || "",
    }));
  } catch {
    return [];
  }
}

async function runAllSearches(searchPlan, tavilyKey, onUpdate) {
  const allResults = [];
  const batches = [];
  for (let i = 0; i < searchPlan.length; i += 5) {
    batches.push(searchPlan.slice(i, i + 5));
  }

  for (let i = 0; i < batches.length; i++) {
    onUpdate(`Searching batch ${i + 1}/${batches.length}...`);
    const batchResults = await Promise.all(
      batches[i].map((q) => tavilySearch(q, tavilyKey))
    );
    allResults.push(...batchResults.flat());
  }

  const seen = new Set();
  const unique = allResults.filter((r) => {
    if (!r.url || seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  const MAX_RESULTS = 20;
  const MAX_SNIPPET = 150;
  return unique.slice(0, MAX_RESULTS).map((r) => ({
    ...r,
    snippet: r.snippet.length > MAX_SNIPPET
      ? r.snippet.slice(0, MAX_SNIPPET) + "…"
      : r.snippet,
  }));
}

const SIGNAL_DESCRIPTIONS = {
  iphone: "iPhone owner — Apple battery, audio IC, device settlements",
  netflix: "Netflix subscriber — price-fixing, streaming settlements",
  appleWatch: "Apple Watch owner — defect settlements",
  facebook: "Facebook user — Meta privacy, biometric settlements",
  google: "Google user — location tracking, privacy settlements",
  equifax: "Equifax breach victim (2017) — data breach settlements",
  tuna: "Bought canned tuna — StarKist/Bumble Bee price-fixing",
  banking: "Had bank overdraft fees — overdraft/junk fee settlements",
};

function buildSystemPrompt(inputs) {
  const stateUrl = getStateTreasuryUrl(inputs.state);
  const checks = inputs.checks || {};
  const today = new Date().toISOString().slice(0, 10);

  const signals = Object.entries(checks)
    .filter(([key, val]) => val && key !== "strategize")
    .map(([key]) => SIGNAL_DESCRIPTIONS[key] || key)
    .join(", ");

  return `Unclaimed money investigator. Person: ${inputs.firstName} ${inputs.lastName}, ${inputs.state}. Date: ${today}
Treasury: MissingMoney.com, Unclaimed.org, ${inputs.state}: ${stateUrl}, ftc.gov/refunds, irs.gov/refunds, pbgc.gov, fdic.gov
Profile: ${signals || "general"}${checks.strategize ? " | STRATEGY MODE: rank by value+deadline" : ""}
Rules: Only active settlements (deadline>${today} or TBD). No fabrication. URLs from results only. Deduplicate.
Return ONLY JSON: {"treasuryFinds":[{"source":"","description":"","searchUrl":"","estimatedValue":"","notes":""}],"settlements":[{"name":"","company":"","category":"","eligible":true,"eligibilityReason":"","estimatedPayout":"","deadline":"","claimUrl":"","confidence":"High|Medium|Low"}],"strategy":"","totalEstimatedMin":0,"totalEstimatedMax":0,"summary":""}`;
}

function parseJsonFromText(text) {
  const clean = String(text || "").replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    return null;
  }
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function mergePartialResults(partials) {
  const merged = {
    treasuryFinds: [],
    settlements: [],
    strategy: "",
    totalEstimatedMin: 0,
    totalEstimatedMax: 0,
    summary: "",
  };

  const seenUrls = new Set();

  for (const p of partials) {
    for (const t of p.treasuryFinds || []) {
      const key = t.searchUrl || t.source;
      if (key && !seenUrls.has(key)) {
        seenUrls.add(key);
        merged.treasuryFinds.push(t);
      }
    }
    for (const s of p.settlements || []) {
      const key = s.claimUrl || s.name;
      if (key && !seenUrls.has(key)) {
        seenUrls.add(key);
        merged.settlements.push(s);
      }
    }
    if (p.strategy) merged.strategy += (merged.strategy ? " " : "") + p.strategy;
    merged.totalEstimatedMin += p.totalEstimatedMin || 0;
    merged.totalEstimatedMax += p.totalEstimatedMax || 0;
    if (p.summary) merged.summary += (merged.summary ? " " : "") + p.summary;
  }

  return merged;
}

async function analyzeBatch(client, inputs, results, batchNum, totalBatches) {
  const context = results
    .map((r, i) => `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.snippet}`)
    .join("\n\n");

  const response = await client.chat.completions.create({
    model: "anthropic/claude-sonnet-4",
    max_tokens: 2000,
    messages: [
      { role: "system", content: buildSystemPrompt(inputs) },
      {
        role: "user",
        content: `Batch ${batchNum}/${totalBatches}. Analyze ONLY these search results. Extract settlements, deadlines, payouts, URLs. Match against user profile. Drop expired. Return JSON only.\n\n${context}`,
      },
    ],
  });

  const rawText = response.choices?.[0]?.message?.content || "";
  return parseJsonFromText(rawText) || {
    treasuryFinds: [],
    settlements: [],
    strategy: "",
    totalEstimatedMin: 0,
    totalEstimatedMax: 0,
    summary: rawText || "",
  };
}

export async function runOpenRouterAgent(openRouterKey, tavilyKey, inputs, onUpdate = () => {}) {
  const searchPlan = buildSearchPlan(inputs);

  onUpdate("Running Tavily web searches...");
  const searchResults = await runAllSearches(searchPlan, tavilyKey, onUpdate);

  const BATCH_SIZE = 7;
  const batches = chunkArray(searchResults, BATCH_SIZE);

  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: openRouterKey,
  });

  const partials = [];
  for (let i = 0; i < batches.length; i++) {
    onUpdate(`Analyzing batch ${i + 1}/${batches.length}...`);
    const partial = await analyzeBatch(client, inputs, batches[i], i + 1, batches.length);
    partials.push(partial);
  }

  onUpdate("Merging and scoring results...");
  const merged = mergePartialResults(partials);

  return matchAndRank(merged, inputs);
}
