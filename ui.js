/**
 * Terminal UI - formats agent results beautifully
 */

import chalk from "chalk";
import boxen from "boxen";

const CATEGORY_ICONS = {
  Device: "📱",
  Streaming: "📺",
  Food: "🐟",
  Tech: "💻",
  Financial: "🏦",
  Other: "📋",
};

const CONFIDENCE_COLOR = {
  High: chalk.green,
  Medium: chalk.yellow,
  Low: chalk.gray,
};

export function formatResults(data, inputs) {
  const { firstName, lastName, state } = inputs;

  // ─── Header ────────────────────────────────────────────────────────────────
  console.log(
    boxen(
      chalk.bold(`Results for: ${firstName} ${lastName} (${state})\n`) +
        chalk.green(
          `💰 Estimated Total: $${data.totalEstimatedMin?.toLocaleString() ?? "?"} – $${data.totalEstimatedMax?.toLocaleString() ?? "?"}`
        ),
      { padding: 1, borderColor: "green", borderStyle: "round" }
    )
  );

  // ─── Treasury / Government Finds ───────────────────────────────────────────
  if (data.treasuryFinds?.length > 0) {
    console.log(chalk.bold.yellow("\n🏛️  GOVERNMENT TREASURY & UNCLAIMED PROPERTY\n"));
    for (const find of data.treasuryFinds) {
      console.log(chalk.bold(`  ${find.source}`));
      console.log(chalk.gray(`  ${find.description}`));
      if (find.estimatedValue) console.log(chalk.green(`  Value: ${find.estimatedValue}`));
      if (find.searchUrl) console.log(chalk.cyan(`  🔗 Search here: ${find.searchUrl}`));
      if (find.notes) console.log(chalk.gray(`  ℹ️  ${find.notes}`));
      console.log();
    }
  }

  // ─── Class Action Settlements ──────────────────────────────────────────────
  if (data.settlements?.length > 0) {
    console.log(chalk.bold.yellow("⚖️  CLASS ACTION SETTLEMENTS\n"));

    const byConfidence = [...data.settlements].sort((a, b) => {
      const order = { High: 0, Medium: 1, Low: 2 };
      return (order[a.confidence] ?? 3) - (order[b.confidence] ?? 3);
    });

    for (const s of byConfidence) {
      const icon = CATEGORY_ICONS[s.category] ?? "📋";
      const colorFn = CONFIDENCE_COLOR[s.confidence] ?? chalk.white;

      console.log(colorFn(`  ${icon} ${s.name}`) + chalk.gray(` [${s.confidence} confidence]`));
      console.log(`     Company: ${chalk.bold(s.company)}`);
      console.log(`     Why you qualify: ${s.eligibilityReason}`);
      if (s.estimatedPayout) console.log(chalk.green(`     Payout: ${s.estimatedPayout}`));
      if (s.deadline) {
        const deadlineText =
          s.deadline === "TBD"
            ? chalk.gray("Deadline: TBD")
            : isExpiringSoon(s.deadline)
            ? chalk.red(`⚠️  Deadline: ${s.deadline} (SOON!)`)
            : chalk.yellow(`Deadline: ${s.deadline}`);
        console.log(`     ${deadlineText}`);
      }
      if (s.claimUrl) console.log(chalk.cyan(`     🔗 Claim: ${s.claimUrl}`));
      console.log();
    }
  }

  // ─── Strategy ──────────────────────────────────────────────────────────────
  if (data.strategy) {
    console.log(chalk.bold.magenta("🎯 STRATEGY & RECOMMENDATIONS\n"));
    const lines = data.strategy.split("\n");
    for (const line of lines) {
      console.log("  " + chalk.white(line));
    }
    console.log();
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  if (data.summary) {
    console.log(
      boxen(chalk.gray(data.summary), {
        title: "Summary",
        titleAlignment: "center",
        padding: 1,
        borderColor: "gray",
      })
    );
  }

  // ─── Footer ────────────────────────────────────────────────────────────────
  console.log(
    chalk.gray(
      "\n⚠️  Always verify deadlines directly on official settlement websites before filing.\n"
    )
  );
}

function isExpiringSoon(dateStr) {
  try {
    const deadline = new Date(dateStr);
    const now = new Date();
    const daysUntil = (deadline - now) / (1000 * 60 * 60 * 24);
    return daysUntil > 0 && daysUntil < 45;
  } catch {
    return false;
  }
}
