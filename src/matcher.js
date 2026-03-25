function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeConfidence(confidence) {
  const value = String(confidence || "").toLowerCase();
  if (value === "high") return "High";
  if (value === "medium") return "Medium";
  return "Low";
}

function isExpired(deadline) {
  if (!deadline || deadline === "TBD") return false;
  const parsed = Date.parse(deadline);
  if (isNaN(parsed)) return false;
  return parsed < Date.now();
}

function conservativeEligibility(settlement, checks) {
  const text = `${settlement.eligibilityReason || ""} ${settlement.name || ""} ${settlement.category || ""}`.toLowerCase();

  const matchers = {
    iphone: /(iphone|apple|device|battery throttle)/,
    netflix: /netflix|streaming/,
    appleWatch: /apple watch|apple/,
    facebook: /facebook|meta|biometric/,
    google: /google|android|location|incognito/,
    equifax: /equifax|experian|data breach/,
    tuna: /tuna|starkist|bumble bee/,
    banking: /bank|overdraft|card|financial|junk fee/,
  };

  return Object.entries(matchers).some(
    ([key, pattern]) => checks[key] && pattern.test(text)
  );
}

const CONFIDENCE_RANK = { High: 0, Medium: 1, Low: 2 };

export function matchAndRank(rawData, inputs) {
  const checks = inputs.checks || {};
  const settlements = safeArray(rawData?.settlements)
    .map((s) => ({
      ...s,
      confidence: normalizeConfidence(s.confidence),
    }))
    .filter((s) => s.eligible !== false)
    .filter((s) => !isExpired(s.deadline))
    .filter((s) => conservativeEligibility(s, checks))
    .filter((s) => s.confidence !== "Low")
    .sort((a, b) => (CONFIDENCE_RANK[a.confidence] ?? 2) - (CONFIDENCE_RANK[b.confidence] ?? 2));

  return {
    treasuryFinds: safeArray(rawData?.treasuryFinds),
    settlements,
    strategy: String(rawData?.strategy || ""),
    summary: String(rawData?.summary || ""),
    totalEstimatedMin: Number(rawData?.totalEstimatedMin || 0),
    totalEstimatedMax: Number(rawData?.totalEstimatedMax || 0),
  };
}
