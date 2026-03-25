import { buildSearchPlan, getStateTreasuryUrl } from "./searcher.js";
import { matchAndRank } from "./matcher.js";

function extractTextBlocks(contentBlocks) {
  return contentBlocks
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
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

function buildSystemPrompt(inputs, searchPlan) {
  const stateUrl = getStateTreasuryUrl(inputs.state);
  const checks = inputs.checks || {};
  const today = new Date().toISOString().slice(0, 10);

  const signals = Object.entries(checks)
    .filter(([key, val]) => val && key !== "strategize")
    .map(([key]) => `${key}: ${SIGNAL_DESCRIPTIONS[key] || key}`)
    .join("\n");

  return `Unclaimed money investigator for ${inputs.firstName} ${inputs.lastName} in ${inputs.state}. Date: ${today}

REQUIRED TREASURY SOURCES (always include all):
MissingMoney.com | Unclaimed.org | ${inputs.state} Treasury: ${stateUrl} | FTC: ftc.gov/refunds | IRS: irs.gov/refunds | PBGC: pbgc.gov | FDIC: fdic.gov

SETTLEMENT DATABASES: topclassactions.com, classaction.org, settlementclaim.com

SEARCH QUERIES (execute via web_search):
${searchPlan.map((q) => `- ${q}`).join("\n")}

USER PROFILE — mark "eligible" only when a signal clearly matches settlement criteria:
${signals || "No signals selected — only broadly applicable settlements"}
${checks.strategize ? "\nSTRATEGY MODE: Rank by value+deadline urgency. Note proof requirements. Estimate total range." : ""}

CONFIDENCE: High=open+matched+verified URL | Medium=likely active but uncertain details | Low=unclear status or weak match

RULES:
- Only settlements with deadlines after ${today} or "TBD"
- Never fabricate amounts/deadlines/URLs — use "TBD" if unconfirmed
- Never invent settlements absent from search results
- Deduplicate across sources; use best available data
- All URLs must come from search results

Return ONLY valid JSON:
{"treasuryFinds":[{"source":"","description":"","searchUrl":"","estimatedValue":"","date":"","notes":""}],"settlements":[{"name":"","company":"","category":"Device|Streaming|Food|Tech|Financial|Other","eligible":true,"eligibilityReason":"","estimatedPayout":"","deadline":"YYYY-MM-DD|TBD","claimUrl":"","claimInstructions":"","confidence":"High|Medium|Low"}],"strategy":"","totalEstimatedMin":0,"totalEstimatedMax":0,"summary":""}`;
}

export async function runAgent(client, inputs, onUpdate = () => {}) {
  const searchPlan = buildSearchPlan(inputs);
  onUpdate("Building search strategy...");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2666,
    system: buildSystemPrompt(inputs, searchPlan),
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [
      {
        role: "user",
        content: "Execute all search queries via web_search. Verify URLs and deadlines. Return JSON only — no skipped sources, no expired settlements.",
      },
    ],
  });

  onUpdate("Scoring conservative matches...");
  const rawText = extractTextBlocks(response.content || []);
  const parsed = parseJsonFromText(rawText) || {
    treasuryFinds: [],
    settlements: [],
    strategy: rawText || "No structured strategy returned.",
    totalEstimatedMin: 0,
    totalEstimatedMax: 0,
    summary: "The model response was not strict JSON; returned text strategy instead.",
  };

  return matchAndRank(parsed, inputs);
}
