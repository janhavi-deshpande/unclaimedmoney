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

function isExpiringSoon(dateStr) {
  const deadline = new Date(dateStr);
  if (Number.isNaN(deadline.getTime())) return false;
  const now = new Date();
  const daysUntil = (deadline - now) / (1000 * 60 * 60 * 24);
  return daysUntil > 0 && daysUntil < 45;
}

export function formatTreasuryScraperResults(scraperResults) {
  if (!scraperResults || scraperResults.length === 0) return;

  console.log(
    boxen(
      chalk.bold.cyan("🔎 LIVE TREASURY SEARCH RESULTS") +
        "\n" +
        chalk.gray("Automated browser searches on official databases"),
      { padding: 1, borderColor: "cyan", borderStyle: "round" }
    )
  );

  for (const site of scraperResults) {
    const hasResults = site.results?.length > 0 && !site.results[0]?.rawText?.includes("No unclaimed property");
    const statusIcon = site.error ? "⚠️" : hasResults ? "✅" : "—";

    console.log(chalk.bold(`\n  ${statusIcon} ${site.source}`));

    if (site.error) {
      console.log(chalk.yellow(`     Could not complete automated search: ${site.error}`));
      if (site.manualUrl) {
        console.log(chalk.cyan(`     Search manually: ${site.manualUrl}`));
      }
      continue;
    }

    if (site.searchUrl) {
      console.log(chalk.gray(`     Searched: ${site.searchUrl}`));
    }

    const noPropertyPattern = /no properties to display|no unclaimed property found/i;
    const allEmpty = site.results?.every((r) => noPropertyPattern.test(r.rawText || ""));

    if (allEmpty || !site.results?.length) {
      console.log(chalk.gray("     No unclaimed property found for this name/state."));
      if (site.manualUrl) {
        console.log(chalk.cyan(`     Verify manually: ${site.manualUrl}`));
      }
    } else {
      for (const result of site.results) {
        if (noPropertyPattern.test(result.rawText || "")) continue;
        if (result.cells?.length > 0) {
          console.log(chalk.white(`     ${result.cells.join(" | ")}`));
        } else if (result.rawText) {
          const lines = result.rawText.split("\n").filter((l) => l.trim());
          for (const line of lines.slice(0, 8)) {
            console.log(chalk.white(`     ${line.trim()}`));
          }
          if (lines.length > 8) {
            console.log(chalk.gray(`     ... and ${lines.length - 8} more lines`));
          }
        }
      }
      if (site.searchUrl) {
        console.log(chalk.cyan(`     View full results: ${site.searchUrl}`));
      }
    }
  }

  console.log();
}

export function formatResults(data, inputs) {
  const { firstName, lastName, state } = inputs;
  const hasUnclaimedMoney = data.hasUnclaimedMoney ?? (data.treasuryFinds?.length > 0);

  console.log(
    boxen(
      chalk.bold(`Results for: ${firstName} ${lastName} (${state})\n`) +
        chalk.bold(`Unclaimed money found: ${hasUnclaimedMoney ? "YES (potential leads)" : "NO clear lead"}\n`) +
        chalk.green(
          `Estimated Total: $${data.totalEstimatedMin?.toLocaleString() ?? "0"} - $${data.totalEstimatedMax?.toLocaleString() ?? "0"}`
        ),
      { padding: 1, borderColor: "green", borderStyle: "round" }
    )
  );

  if (data.treasuryFinds?.length) {
    console.log(chalk.bold.yellow("\nGovernment Treasury and Unclaimed Property\n"));
    for (const find of data.treasuryFinds) {
      console.log(chalk.bold(`  ${find.source || "Government resource"}`));
      if (find.description) console.log(chalk.gray(`  ${find.description}`));
      if (find.estimatedValue) console.log(chalk.green(`  Value: ${find.estimatedValue}`));
      if (find.date) console.log(chalk.yellow(`  Date/Deadline: ${find.date}`));
      if (find.searchUrl) console.log(chalk.cyan(`  Search: ${find.searchUrl}`));
      if (find.notes) console.log(chalk.gray(`  Notes: ${find.notes}`));
      console.log();
    }
  }

  if (data.settlements?.length) {
    console.log(chalk.bold.yellow("Class Action Settlements\n"));

    const byConfidence = [...data.settlements].sort((a, b) => {
      const order = { High: 0, Medium: 1, Low: 2 };
      return (order[a.confidence] ?? 3) - (order[b.confidence] ?? 3);
    });

    for (const settlement of byConfidence) {
      const icon = CATEGORY_ICONS[settlement.category] ?? "📋";
      const colorFn = CONFIDENCE_COLOR[settlement.confidence] ?? chalk.white;

      console.log(
        colorFn(`  ${icon} ${settlement.name || "Unnamed settlement"}`) +
          chalk.gray(` [${settlement.confidence || "Low"} confidence]`)
      );
      if (settlement.company) console.log(`     Company: ${chalk.bold(settlement.company)}`);
      if (settlement.eligibilityReason) {
        console.log(`     Why you qualify: ${settlement.eligibilityReason}`);
      }
      if (settlement.estimatedPayout) {
        console.log(chalk.green(`     Payout: ${settlement.estimatedPayout}`));
      }
      if (settlement.deadline) {
        const deadlineText =
          /no published deadline|no universal deadline/i.test(settlement.deadline)
            ? chalk.gray(`Deadline: ${settlement.deadline}`)
            : isExpiringSoon(settlement.deadline)
              ? chalk.red(`Deadline: ${settlement.deadline} (SOON)`)
              : chalk.yellow(`Deadline: ${settlement.deadline}`);
        console.log(`     ${deadlineText}`);
      }
      if (settlement.claimUrl) console.log(chalk.cyan(`     Claim: ${settlement.claimUrl}`));
      if (settlement.claimInstructions) {
        console.log(chalk.gray(`     Instructions: ${settlement.claimInstructions}`));
      }
      console.log();
    }
  }

  if (data.strategy) {
    console.log(chalk.bold.magenta("Strategy and Recommendations\n"));
    for (const line of String(data.strategy).split("\n")) {
      console.log(`  ${line}`);
    }
    console.log();
  }

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

  console.log(
    chalk.gray("\nAlways verify deadlines on official claim websites before filing.\n")
  );
}
