# Unclaimed Money Agent

An AI-powered agent that scans for unclaimed money, class action settlements, and government treasury funds matching the user's profile.

## Project Overview

This tool helps users discover money owed to them from:
- **State/County/City treasuries** (unclaimed property, forgotten bank accounts, utility deposits)
- **Federal programs** (IRS, FDIC, pension funds)
- **Class action settlements** (Apple, Facebook, Google, Netflix, tuna, etc.)

## Architecture

```
unclaimed-money-agent/
├── CLAUDE.md          ← You are here
├── package.json
├── index.js           ← Main CLI entry point
└── src/
    ├── agent.js       ← Core AI agent logic (Anthropic SDK)
    ├── searcher.js    ← Web search tool wrapper
    ├── matcher.js     ← Settlement matching logic
    └── ui.js          ← Terminal output formatting
```

## Setup

```bash
npm install
export ANTHROPIC_API_KEY=your_key_here
node index.js
```

## How the Agent Works

1. **User inputs**: first name, last name, state, and selected eligibility checkboxes
2. **Agent builds a profile** and generates targeted search queries
3. **Web search tool** scans live settlement databases and government sites
4. **Matcher** scores results against the user profile
5. **Output**: ranked list of potential claims with estimated values and filing links

## Key Commands for Claude Code

- `node index.js` — run the interactive CLI
- `node index.js --name "John Doe" --state CA --iphone --netflix` — run with flags
- `node index.js --strategize` — get AI strategy recommendations

## Agent Behavior Guidelines

- Always search `missingmoney.com`, `unclaimed.org`, state treasury sites
- For settlements, search `topclassactions.com`, `classaction.org`, `settlementclaim.com`
- Match conservatively — only flag high-confidence matches
- Always include deadline dates and estimated payout ranges
- Never fabricate claim amounts; use "TBD" if unknown

## Settlement Categories to Always Check

### Device-Based
- iPhone battery throttling (Apple)
- iPhone 7 audio IC defect
- Any active Apple device class actions

### Streaming
- Netflix price-fixing settlements
- Any active streaming platform settlements

### Food/Retail
- Starkist/tuna price fixing
- Trader Joe's, Whole Foods labeling suits

### Big Tech / Social
- Facebook/Meta privacy (Biometric, Cambridge Analytica follow-ons)
- Google location tracking
- TikTok privacy

### Financial
- Credit card interchange fee settlements
- Bank overdraft fee settlements
- Equifax/Experian data breach

## State Treasury Sites by State Code

```json
{
  "CA": "https://ucpi.sco.ca.gov/",
  "NY": "https://www.osc.state.ny.us/unclaimed-funds",
  "TX": "https://claimittexas.gov/",
  "FL": "https://www.fltreasurehunt.gov/",
  "WA": "https://ucp.dor.wa.gov/",
  "IL": "https://icash.illinoistreasurer.gov/"
}
```

## Federal Resources

- IRS: https://www.irs.gov/refunds
- FDIC: https://www.fdic.gov/resources/resolutions/bank-failures/failed-bank-list/
- Pension Benefit Guaranty: https://www.pbgc.gov/workers-retirees/find-missing-participants
- FTC Refunds: https://www.ftc.gov/refunds
