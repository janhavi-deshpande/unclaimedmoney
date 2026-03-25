const CURRENT_YEAR = new Date().getFullYear();

const ALWAYS_SETTLEMENT_TOPICS = [
  `open class action settlements ${CURRENT_YEAR} claim form deadline`,
  "Apple iPhone battery throttling settlement claim form",
  "iPhone 7 audio IC defect class action settlement",
  "active Apple device class action settlements open claims",
  "Netflix price fixing class action settlement claim",
  "active streaming platform class action settlements open",
  "StarKist tuna price fixing settlement claim form",
  "Trader Joe's labeling class action settlement",
  "Whole Foods labeling class action settlement",
  "Facebook Meta privacy biometric class action settlement claim",
  "Google location tracking privacy settlement claim form",
  "TikTok privacy class action settlement",
  "credit card interchange fee settlement Visa Mastercard",
  "bank overdraft fee class action settlement claim",
  "Equifax data breach settlement claim form",
  `top open class action settlements ${CURRENT_YEAR} filing deadline`,
];

const CHECK_TO_TOPICS = {
  iphone: [
    `iPhone class action settlement open claims ${CURRENT_YEAR}`,
    "Apple battery throttling settlement how to file claim",
    "Apple device defect settlement claim form open",
  ],
  netflix: [
    `Netflix class action settlement open claims ${CURRENT_YEAR}`,
    "Netflix subscription price settlement claim deadline",
  ],
  appleWatch: [
    `Apple Watch class action settlement open claims ${CURRENT_YEAR}`,
    "Apple Watch defect ghost touch settlement",
  ],
  facebook: [
    `Facebook Meta privacy settlement open claims ${CURRENT_YEAR}`,
    "Facebook biometric data Illinois settlement claim",
    "Meta Cambridge Analytica settlement claim form",
  ],
  google: [
    `Google privacy settlement open claims ${CURRENT_YEAR}`,
    "Google location tracking Incognito settlement claim",
  ],
  equifax: [
    `Equifax data breach settlement claim ${CURRENT_YEAR}`,
    "Equifax settlement extended claim deadline",
  ],
  tuna: [
    `canned tuna price fixing settlement claim ${CURRENT_YEAR}`,
    "StarKist Bumble Bee tuna settlement claim form",
  ],
  banking: [
    `bank overdraft fee settlement claim ${CURRENT_YEAR}`,
    "Wells Fargo Chase Bank of America overdraft settlement",
    "bank junk fee class action settlement claim form",
  ],
};

export const STATE_TREASURY_URLS = {
  CA: "https://ucpi.sco.ca.gov/",
  NY: "https://www.osc.state.ny.us/unclaimed-funds",
  TX: "https://claimittexas.gov/",
  FL: "https://www.fltreasurehunt.gov/",
  WA: "https://ucp.dor.wa.gov/",
  IL: "https://icash.illinoistreasurer.gov/",
};

export function buildSearchPlan(inputs) {
  const state = inputs.state?.toUpperCase();
  const checks = inputs.checks || {};

  const required = [
    "site:missingmoney.com unclaimed property search",
    "site:unclaimed.org state unclaimed property programs",
    `site:${new URL(getStateTreasuryUrl(state)).hostname} unclaimed property`,
    `site:topclassactions.com open settlements ${CURRENT_YEAR} claim form`,
    `site:classaction.org open settlements ${CURRENT_YEAR} claim deadline`,
    `site:settlementclaim.com active settlements ${CURRENT_YEAR}`,
    "site:ftc.gov/refunds active refund programs",
    "site:irs.gov unclaimed refunds tax",
    "site:pbgc.gov find missing participants pension",
    "site:fdic.gov unclaimed deposits failed bank",
    ...ALWAYS_SETTLEMENT_TOPICS,
  ];

  const eligibility = Object.entries(checks)
    .filter(([, enabled]) => Boolean(enabled))
    .flatMap(([key]) => CHECK_TO_TOPICS[key] || []);

  return [...new Set([...required, ...eligibility])];
}

export function getStateTreasuryUrl(stateCode) {
  return STATE_TREASURY_URLS[stateCode] || "https://missingmoney.com";
}
