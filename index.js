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
import { formatResults } from "./src/ui.js";

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
  if (argv.name && argv.state) {
    const [firstName, ...lastParts] = argv.name.split(" ");
    return {
      firstName,
      lastName: lastParts.join(" "),
      state: argv.state.toUpperCase(),
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
    if (!apiKey) {
      console.error(chalk.red("❌ ANTHROPIC_API_KEY environment variable not set."));
      console.log(chalk.yellow("  export ANTHROPIC_API_KEY=your_key_here"));
      process.exit(1);
    }

    const client = new Anthropic({ apiKey });
    const inputs = await collectInputs();

    console.log("\n" + chalk.yellow("🔍 Scanning for unclaimed money...") + "\n");
    const spinner = ora({ text: "Agent is searching...", color: "green" }).start();

    const results = await runAgent(client, inputs, (update) => {
      spinner.text = update;
    });

    spinner.succeed(chalk.green("Scan complete!"));
    console.log("\n");
    formatResults(results, inputs);
  } catch (err) {
    console.error(chalk.red("\n❌ Error:"), err.message);
    process.exit(1);
  }
}

main();
