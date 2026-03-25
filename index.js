#!/usr/bin/env node
/**
 * Unclaimed Money Agent - CLI Entry Point
 * Run: node index.js
 */

import Anthropic from "@anthropic-ai/sdk";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import boxen from "boxen";
import minimist from "minimist";
import { runAgent } from "./src/agent.js";
import { runOpenRouterAgent } from "./src/openRouterAgent.js";
import { runTreasurySearches } from "./src/treasuryScraper.js";
import { formatResults, formatTreasuryScraperResults } from "./src/ui.js";

const argv = minimist(process.argv.slice(2));

// ─── Banner ───────────────────────────────────────────────────────────────────
console.log(
  boxen(
    chalk.green.bold("💰 UNCLAIMED MONEY AGENT") +
      "\n" +
      chalk.gray("Powered by Claude AI + Web Search"),
    {
      padding: 1,
      margin: 1,
      borderStyle: "double",
      borderColor: "green",
    }
  )
);

// ─── States list ──────────────────────────────────────────────────────────────
const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"
];

// ─── Interactive prompt or parse flags ────────────────────────────────────────
async function collectInputs() {
  // If CLI flags provided, use them
  if (argv.name || argv.state || argv.strategize) {
    const [firstNameRaw = "", ...lastParts] = String(argv.name || "").trim().split(" ");
    const firstName = firstNameRaw.trim();
    const lastName = lastParts.join(" ").trim();
    const state = String(argv.state || "").toUpperCase();

    if (!firstName || !lastName || !US_STATES.includes(state)) {
      console.log(chalk.yellow("Missing or invalid flags, switching to interactive prompts...\n"));
    } else {
      return {
        firstName,
        lastName,
        state,
        checks: {
          iphone: !!argv.iphone,
          netflix: !!argv.netflix,
          strategize: !!argv.strategize,
          appleWatch: !!argv["apple-watch"],
          facebook: !!argv.facebook,
          google: !!argv.google,
          equifax: !!argv.equifax,
          tuna: !!argv.tuna,
          banking: !!argv.banking,
        },
      };
    }
  }

  // Interactive mode
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "firstName",
      message: chalk.cyan("First name:"),
      validate: (v) => v.trim().length > 0 || "Required",
    },
    {
      type: "input",
      name: "lastName",
      message: chalk.cyan("Last name:"),
      validate: (v) => v.trim().length > 0 || "Required",
    },
    {
      type: "list",
      name: "state",
      message: chalk.cyan("Your state:"),
      choices: US_STATES,
    },
    {
      type: "checkbox",
      name: "eligibility",
      message: chalk.cyan("What applies to you? (select all that match)"),
      choices: [
        { name: "📱 I use/used an iPhone (11/12/13/14/15/16/17 or any variant)", value: "iphone" },
        { name: "📺 I watch/watched Netflix", value: "netflix" },
        { name: "⌚ I own/owned an Apple Watch", value: "appleWatch" },
        { name: "👤 I have/had a Facebook account", value: "facebook" },
        { name: "🔍 I use Google services", value: "google" },
        { name: "📊 My data was in the Equifax breach (2017)", value: "equifax" },
        { name: "🐟 I bought canned tuna (StarKist, Bumble Bee, etc.)", value: "tuna" },
        { name: "🏦 I had overdraft fees from a major bank", value: "banking" },
        {
          name: "🎯 Strategize for me — suggest the most lucrative options",
          value: "strategize",
        },
      ],
    },
  ]);

  const checks = {};
  for (const item of answers.eligibility) {
    checks[item] = true;
  }

  return {
    firstName: answers.firstName.trim(),
    lastName: answers.lastName.trim(),
    state: answers.state,
    checks,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const inputs = await collectInputs();

    console.log("\n" + chalk.yellow("🔍 Scanning for unclaimed money...") + "\n");
    const spinner = ora({ text: "Agent is searching...", color: "green" }).start();

    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const tavilyKey = process.env.TAVILY_API_KEY;

    // Run treasury scraper (browser automation) in parallel with AI agent
    spinner.text = "Launching live treasury searches...";
    const treasuryPromise = runTreasurySearches(
      inputs.firstName, inputs.lastName, inputs.state,
      (update) => { spinner.text = update; }
    ).catch((err) => {
      console.error(chalk.gray(`\n  Treasury scraper warning: ${err.message}`));
      return [];
    });

    let agentResults;
    if (apiKey) {
      const client = new Anthropic({ apiKey });
      agentResults = await runAgent(client, inputs, (update) => {
        spinner.text = update;
      });
    } else if (openRouterKey && tavilyKey) {
      spinner.text = "Using OpenRouter + Tavily...";
      agentResults = await runOpenRouterAgent(openRouterKey, tavilyKey, inputs, (update) => {
        spinner.text = update;
      });
    } else {
      spinner.fail("No API keys found.");
      console.log(chalk.yellow("\nSet one of these key combinations:"));
      console.log(chalk.cyan("  Option 1: ") + "export ANTHROPIC_API_KEY=your_key");
      console.log(chalk.cyan("  Option 2: ") + "export OPENROUTER_API_KEY=your_key && export TAVILY_API_KEY=your_key");
      process.exit(1);
    }

    const treasuryScraperResults = await treasuryPromise;

    spinner.succeed(chalk.green("Scan complete!"));
    console.log("\n");

    if (treasuryScraperResults.length > 0) {
      formatTreasuryScraperResults(treasuryScraperResults);
    }
    formatResults(agentResults, inputs);
  } catch (err) {
    console.error(chalk.red("\n❌ Error:"), err.message);
    process.exit(1);
  }
}

main();
