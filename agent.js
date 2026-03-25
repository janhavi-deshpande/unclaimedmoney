/**
 * Core AI Agent
 * Uses Claude with web_search tool to find unclaimed money and settlements
 */

const STATE_TREASURY_URLS = {
  CA: "https://ucpi.sco.ca.gov/",
  NY: "https://www.osc.state.ny.us/unclaimed-funds",
  TX: "https://claimittexas.gov/",
  FL: "https://www.fltreasurehunt.gov/",
  WA: "https://ucp.dor.wa.gov/",
  IL: "https://icash.illinoistreasurer.gov/",
  PA: "https://www.patreasury.gov/unclaimed-property/",
  OH: "https://com.ohio.gov/divisions-and-programs/unclaimed-funds/unclaimed-funds",
  GA: "https://dor.georgia.gov/unclaimed-property",
  NC: "https://www.treasurer.nc.gov/programs-services/unclaimed-property",
};

function buildSystemPrompt(inputs) {
  const { firstName, lastName, state, checks } = inputs;
  const stateTreasuryUrl = STATE_TREASURY_URLS[state] || `https://missingmoney.com`;

  return `You are an expert unclaimed money researcher and class action settlement specialist. 
Your job is to find all potential unclaimed money and settlements for: ${firstName} ${lastName}, residing in ${state}.

PROFILE ELIGIBILITY:
${checks.iphone ? "✓ iPhone user (11/12/13/14/15/16/17 variants)" : ""}
${checks.netflix ? "✓ Netflix subscriber" : ""}
${checks.appleWatch ? "✓ Apple Watch owner" : ""}
${checks.facebook ? "✓ Facebook/Meta account holder" : ""}
${checks.google ? "✓ Google services user" : ""}
${checks.equifax ? "✓ Potentially affected by 2017 Equifax breach" : ""}
${checks.tuna ? "✓ Canned tuna purchaser" : ""}
${checks.banking ? "✓ Bank overdraft fee victim" : ""}
${checks.strategize ? "✓ STRATEGIZE MODE: recommend the best high-value, broad-eligibility settlements" : ""}

YOUR SEARCH STRATEGY:
1. Search for active class action settlements matching the profile above
2. Search the ${state} state treasury for unclaimed property (${stateTreasuryUrl})
3. Search MissingMoney.com for nationwide unclaimed funds
4. Search federal programs: FTC refunds, IRS unclaimed refunds, PBGC missing participants
5. For each settlement found, note: deadline date, estimated payout, eligibility criteria, claim URL

REQUIRED SEARCHES (do all of these):
- "active class action settlements 2024 2025 iPhone Apple"
- "active Netflix class action settlement claim"  
- "unclaimed property ${state} treasury search"
- "FTC refund active settlements 2025"
- "topclassactions.com open settlements deadline 2025"
- Any others relevant to the checked eligibility boxes

OUTPUT FORMAT (JSON):
Return a JSON object with this structure:
{
  "treasuryFinds": [
    {
      "source": "State/Federal Treasury name",
      "description": "What this is",
      "searchUrl": "URL to search for ${lastName}",
      "estimatedValue": "Range or 'Varies'",
      "notes": "How to claim"
    }
  ],
  "settlements": [
    {
      "name": "Settlement name",
      "company": "Company being sued",
      "category": "Device/Streaming/Food/Tech/Financial/Other",
      "eligible": true,
      "eligibilityReason": "Why this person qualifies",
      "estimatedPayout": "$X - $Y or 'Pro rata'",
      "deadline": "YYYY-MM-DD or 'TBD'",
      "claimUrl": "Direct claim URL",
      "confidence": "High/Medium/Low"
    }
  ],
  "strategy": "If strategize mode: paragraph with top recommendations and estimated total",
  "totalEstimatedMin": 0,
  "totalEstimatedMax": 0,
  "summary": "One paragraph summary"
}

Be thorough. Search broadly. Only include settlements that are currently OPEN (not expired).
Return ONLY valid JSON, no markdown, no preamble.`;
}

export async function runAgent(client, inputs, onUpdate) {
  const messages = [
    {
      role: "user",
      content: `Find all unclaimed money and active settlements for me. Search thoroughly using the web search tool. My profile: ${inputs.firstName} ${inputs.lastName}, ${inputs.state}. Checks: ${JSON.stringify(inputs.checks)}. Return results as JSON per your instructions.`,
    },
  ];

  const tools = [
    {
      type: "web_search_20250305",
      name: "web_search",
    },
  ];

  let finalText = "";
  let iterations = 0;
  const MAX_ITERATIONS = 10;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    onUpdate(`Searching... (step ${iterations})`);

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: buildSystemPrompt(inputs),
      tools,
      messages,
    });

    // Add assistant response to history
    messages.push({ role: "assistant", content: response.content });

    // Check if done
    if (response.stop_reason === "end_turn") {
      // Extract text content
      for (const block of response.content) {
        if (block.type === "text") {
          finalText += block.text;
        }
      }
      break;
    }

    // Handle tool use
    if (response.stop_reason === "tool_use") {
      const toolResults = [];

      for (const block of response.content) {
        if (block.type === "tool_use") {
          onUpdate(`Searching: "${block.input?.query || "..."}" `);
          // The web_search tool result comes back automatically in next turn
          // We just need to add a tool_result placeholder
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "Search executed.",
          });
        }
      }

      // Add tool results
      messages.push({ role: "user", content: toolResults });
    }
  }

  // Parse the JSON result
  try {
    // Strip markdown code fences if present
    const clean = finalText.replace(/```json|```/g, "").trim();
    const jsonStart = clean.indexOf("{");
    const jsonEnd = clean.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd !== -1) {
      return JSON.parse(clean.slice(jsonStart, jsonEnd + 1));
    }
  } catch (e) {
    // If JSON parse fails, return raw text wrapped
    return {
      treasuryFinds: [],
      settlements: [],
      strategy: finalText,
      summary: "See strategy field for results.",
      totalEstimatedMin: 0,
      totalEstimatedMax: 0,
    };
  }

  return {
    treasuryFinds: [],
    settlements: [],
    strategy: "No results found.",
    summary: "Search completed but no matching claims found.",
    totalEstimatedMin: 0,
    totalEstimatedMax: 0,
  };
}
