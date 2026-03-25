import { buildSearchPlan, getStateTreasuryUrl } from "./searcher.js";

const FEDERAL_FINDS = [
  {
    source: "FTC Refunds",
    description: "Check active and past FTC refund programs.",
    searchUrl: "https://www.ftc.gov/refunds",
    estimatedValue: "Varies by refund program",
    date: "No single deadline (program-specific)",
    notes: "Open the refunds page, find your case, and follow the claim instructions shown.",
  },
  {
    source: "IRS Refunds",
    description: "Federal tax refund lookup and filing guidance.",
    searchUrl: "https://www.irs.gov/refunds",
    estimatedValue: "Varies by taxpayer record",
    date: "Tax-year dependent",
    notes: "Use IRS refund tools and filing-year guidance to check unclaimed refunds.",
  },
  {
    source: "PBGC Missing Participants",
    description: "Search for missing pension benefits.",
    searchUrl: "https://www.pbgc.gov/workers-retirees/find-missing-participants",
    estimatedValue: "Varies by pension record",
    date: "No universal deadline published",
    notes: "Search by name and follow PBGC claim verification steps.",
  },
];

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(text) {
  return decodeHtml(String(text || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

async function ddgSearch(query) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) return [];
    const html = await response.text();
    const chunks = [...html.matchAll(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*>[\s\S]*?<\/a>/g)];
    return chunks.slice(0, 8).map((match) => {
      const anchor = match[0];
      const hrefMatch = anchor.match(/href="([^"]+)"/);
      const title = stripTags(anchor);
      const link = decodeHtml(hrefMatch?.[1] || "");
      return { title, link, snippet: "" };
    });
  } catch {
    return [];
  }
}

async function fetchPageText(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) return "";
    const html = await response.text();
    return stripTags(html).slice(0, 18000);
  } catch {
    return "";
  }
}

function extractMoneyDateAndInstructions(text) {
  const payoutMatch = text.match(
    /\$\s?\d[\d,]*(?:\.\d{2})?(?:\s?(?:-|to)\s?\$\s?\d[\d,]*(?:\.\d{2})?)?/i
  );
  const explicitDateMatch = text.match(
    /\b(?:deadline|claim by|file by|submit by|due by)[:\s-]*([A-Z][a-z]{2,9}\s+\d{1,2},\s+20\d{2}|20\d{2}-\d{2}-\d{2})/i
  );
  const genericDateMatch = text.match(
    /\b([A-Z][a-z]{2,9}\s+\d{1,2},\s+20\d{2}|20\d{2}-\d{2}-\d{2})\b/
  );
  const instructionMatch = text.match(
    /\b(?:how to claim|to claim|claim form|file a claim|submit a claim)[^.]{0,180}\./i
  );

  return {
    amount: payoutMatch ? payoutMatch[0] : "Amount not publicly listed",
    date: explicitDateMatch?.[1] || genericDateMatch?.[1] || "No published deadline/date",
    instructions:
      instructionMatch?.[0] ||
      "Open claim page, confirm eligibility criteria, then submit claim with identity/address proof.",
  };
}

function uniqueByLink(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item.link || seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });
}

function buildTreasuryFinds(inputs) {
  const fullName = `${inputs.firstName} ${inputs.lastName}`;
  const stateUrl = getStateTreasuryUrl(inputs.state);
  const missingMoneyQuery = `https://missingmoney.com/app/claim-search?name=${encodeURIComponent(fullName)}&state=${encodeURIComponent(inputs.state)}`;

  return [
    {
      source: `${inputs.state} State Treasury`,
      description: `Official ${inputs.state} unclaimed property search.`,
      searchUrl: stateUrl,
      estimatedValue: "Varies by property record",
      date: "No universal deadline published",
      notes: `Search "${fullName}" exactly, then verify address history before filing.`,
    },
    {
      source: "MissingMoney",
      description: "Nationwide unclaimed property search portal.",
      searchUrl: missingMoneyQuery,
      estimatedValue: "Varies by claim record",
      date: "No universal deadline published",
      notes: `Search "${fullName}" with state "${inputs.state}" and file claims at linked state agencies.`,
    },
    {
      source: "Unclaimed.org",
      description: "Directory of official state unclaimed property programs.",
      searchUrl: "https://unclaimed.org",
      estimatedValue: "Varies by state program",
      date: "No universal deadline published",
      notes: "Use your state link and complete the state's identity verification process.",
    },
    ...FEDERAL_FINDS,
  ];
}

function extractSettlementMetadata(result) {
  const text = `${result.title} ${result.snippet}`;
  const payoutMatch = text.match(/\$\s?\d[\d,]*(?:\s?-\s?\$\s?\d[\d,]*)?/);
  const dateMatch = text.match(/\b(20\d{2}-\d{2}-\d{2}|[A-Z][a-z]{2,9}\s+\d{1,2},\s+20\d{2})\b/);
  return {
    estimatedPayout: payoutMatch ? payoutMatch[0] : "Amount not publicly listed",
    deadline: dateMatch ? dateMatch[0] : "No published deadline/date",
  };
}

function classifyCategory(title) {
  const t = title.toLowerCase();
  if (/iphone|apple|device|watch/.test(t)) return "Device";
  if (/netflix|streaming/.test(t)) return "Streaming";
  if (/tuna|food|trader joe|whole foods/.test(t)) return "Food";
  if (/bank|card|equifax|experian|financial|overdraft/.test(t)) return "Financial";
  if (/google|facebook|meta|tiktok|privacy|tech/.test(t)) return "Tech";
  return "Other";
}

export async function runNoKeyAgent(inputs, onUpdate = () => {}) {
  const fullName = `${inputs.firstName} ${inputs.lastName}`;
  const searchPlan = buildSearchPlan(inputs).slice(0, 10);

  onUpdate("Searching public sources without API key...");
  const baseFinds = buildTreasuryFinds(inputs);

  const nameQueries = [
    `${fullName} ${inputs.state} unclaimed property`,
    `${fullName} missing money`,
    `${fullName} treasury unclaimed funds ${inputs.state}`,
  ];

  const allSearches = await Promise.all(
    [...nameQueries, ...searchPlan].map((q) => ddgSearch(q))
  );

  const flattened = uniqueByLink(allSearches.flat());
  const treasuryCandidates = flattened
    .filter((r) =>
      /(missingmoney|unclaimed|treasury|ftc|irs|pbgc|claimit|osc|icash|ucpi)/i.test(
        `${r.title} ${r.link}`
      )
    )
    .slice(0, 6)
    .map((r) => ({
      source: "Potential Match (Web Search)",
      description: r.title,
      searchUrl: r.link,
      estimatedValue: "Amount not publicly listed",
      date: "No published deadline/date",
      notes:
        `Open this result and verify whether it references "${fullName}". ` +
        "If yes, complete the official claim form and identity verification.",
    }));

  const settlementSeeds = flattened
    .filter((r) => /(class action|settlement|claim form|refund)/i.test(`${r.title} ${r.link}`))
    .slice(0, 12);

  onUpdate("Extracting amount and deadline from result pages...");
  const settlements = await Promise.all(
    settlementSeeds.map(async (r) => {
      const pageText = await fetchPageText(r.link);
      const pageMeta = pageText ? extractMoneyDateAndInstructions(pageText) : null;
      const meta = extractSettlementMetadata(r);
      return {
        name: r.title,
        company: "See linked case page",
        category: classifyCategory(r.title),
        eligible: true,
        eligibilityReason: "Potential match based on selected profile and keyword search.",
        estimatedPayout: pageMeta?.amount || meta.estimatedPayout,
        deadline: pageMeta?.date || meta.deadline,
        claimUrl: r.link,
        claimInstructions:
          pageMeta?.instructions ||
          "Open claim page and complete claim form with eligibility and proof details.",
        confidence: "Medium",
      };
    })
  );

  const hasUnclaimedMoney = baseFinds.length > 0 || treasuryCandidates.length > 0;
  return {
    hasUnclaimedMoney,
    treasuryFinds: [...baseFinds, ...treasuryCandidates],
    settlements,
    strategy:
      "Prioritize official treasury searches first (state + MissingMoney), then federal sources, then open settlements with upcoming deadlines.",
    totalEstimatedMin: 0,
    totalEstimatedMax: 0,
    summary: hasUnclaimedMoney
      ? "Potential unclaimed money leads were found. Verify each lead on the linked official site before filing."
      : "No strong unclaimed money lead was confirmed from public search; continue with official treasury and federal lookup links.",
  };
}
