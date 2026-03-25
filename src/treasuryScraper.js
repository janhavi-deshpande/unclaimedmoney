import puppeteer from "puppeteer";
import { STATE_TREASURY_URLS } from "./searcher.js";

const SEARCH_TIMEOUT = 30_000;
const NAV_TIMEOUT = 20_000;

async function withBrowser(fn) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

async function fillInput(page, selectors, value) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.click({ clickCount: 3 });
        await el.type(value, { delay: 30 });
        return true;
      }
    } catch {}
  }
  return false;
}

async function selectState(page, selectors, stateCode) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      const tagName = await el.evaluate((e) => e.tagName.toLowerCase());
      if (tagName === "select") {
        await page.select(sel, stateCode, stateCode.toLowerCase());
        return true;
      }
      await el.click();
      await page.keyboard.type(stateCode, { delay: 50 });
      return true;
    } catch {}
  }
  return false;
}

/**
 * Search missingmoney.com for unclaimed property.
 * Flow: homepage form → /app/claim-search → fill state → click SEARCH → scrape results.
 * The site uses Cloudflare Turnstile, so we navigate from the homepage to avoid hard bot blocks.
 */
export async function searchMissingMoney(firstName, lastName, stateCode) {
  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    page.setDefaultTimeout(SEARCH_TIMEOUT);
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

    // Step 1: Load homepage
    try {
      await page.goto("https://www.missingmoney.com", { waitUntil: "networkidle2", timeout: NAV_TIMEOUT });
    } catch {
      return { source: "MissingMoney.com", results: [], error: "Could not load site", manualUrl: "https://www.missingmoney.com" };
    }
    await new Promise((r) => setTimeout(r, 2000));

    // Step 2: Fill the visible homepage form (#lastName / #firstName) and submit
    const lastEl = await page.$("#lastName");
    const firstEl = await page.$("#firstName");
    if (!lastEl || !firstEl) {
      return { source: "MissingMoney.com", results: [], error: "Homepage form fields not found", manualUrl: "https://www.missingmoney.com" };
    }
    await lastEl.click({ clickCount: 3 });
    await lastEl.type(lastName, { delay: 40 });
    await firstEl.click({ clickCount: 3 });
    await firstEl.type(firstName, { delay: 40 });

    // Click the visible "Search" submit button
    const submitButtons = await page.$$('button[type="submit"].btn.btn-secondary');
    let clicked = false;
    for (const btn of submitButtons) {
      const isVisible = await btn.evaluate((el) => el.offsetParent !== null);
      if (isVisible) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15_000 }).catch(() => {}),
          btn.click(),
        ]);
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      await page.keyboard.press("Enter");
    }

    // Step 3: We're now on /app/claim-search — name fields carry over
    await new Promise((r) => setTimeout(r, 4000));

    // Accept cookies if the banner is present
    try {
      const acceptBtn = await page.$("#onetrust-accept-btn-handler");
      if (acceptBtn) await acceptBtn.click();
    } catch {}

    // Wait for Turnstile verification (polls for the response token, 1s intervals)
    for (let i = 0; i < 8; i++) {
      const token = await page.evaluate(() => {
        const el = document.querySelector('input[name="cf-turnstile-response"]');
        return el?.value || "";
      });
      if (token.length > 10) break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Step 4: Select state
    const stateSelect = await page.$("#state");
    if (stateSelect) {
      await page.select("#state", stateCode);
    }

    // Step 5: Click SEARCH (button#btn-turnstile)
    const searchBtn = await page.$("#btn-turnstile");
    if (searchBtn) {
      await searchBtn.click();
    } else {
      await page.keyboard.press("Enter");
    }

    // Step 6: Wait for results
    try {
      await page.waitForSelector(
        "table, .results, [class*='result'], [class*='property'], [class*='claim']",
        { timeout: 15_000 }
      );
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));

    const pageText = await page.evaluate(() => document.body?.innerText || "");
    if (/bot_detected|bot detection/i.test(pageText)) {
      return {
        source: "MissingMoney.com",
        results: [],
        error: "Cloudflare bot verification blocked the automated search",
        manualUrl: "https://www.missingmoney.com",
      };
    }

    // Step 7: Extract results
    const results = await page.evaluate(() => {
      const items = [];
      const rows = document.querySelectorAll(
        "table tbody tr, [class*='result-row'], [class*='ResultRow'], " +
        "[class*='property-row'], [class*='PropertyRow'], .card.result"
      );
      for (const row of rows) {
        const cells = row.querySelectorAll("td, [class*='cell'], [class*='col']");
        const text = row.innerText?.trim();
        if (text && text.length > 5) {
          items.push({
            rawText: text.slice(0, 500),
            cells: Array.from(cells).map((c) => c.innerText?.trim()).filter(Boolean),
          });
        }
      }

      if (items.length === 0) {
        const body = document.body.innerText || "";
        if (/no results|no records|no unclaimed|nothing found|0 results|no matches/i.test(body)) {
          items.push({ rawText: "No unclaimed property found for this name/state.", cells: [] });
        } else {
          const main = document.querySelector("[class*='search-result'], [class*='SearchResult'], main, .content") || document.body;
          const snippet = main.innerText?.slice(0, 2000) || "";
          if (snippet.length > 50) {
            items.push({ rawText: snippet.slice(0, 1000), cells: [], note: "raw page content" });
          }
        }
      }
      return items;
    });

    return {
      source: "MissingMoney.com",
      searchUrl: page.url(),
      results: results.slice(0, 20),
      resultCount: results.length,
    };
  });
}

/**
 * Search a state treasury site. Each state has a different form,
 * so we attempt a generic approach and fall back to returning the URL.
 */
export async function searchStateTreasury(firstName, lastName, stateCode) {
  const treasuryUrl = STATE_TREASURY_URLS[stateCode];
  if (!treasuryUrl) {
    return {
      source: `${stateCode} State Treasury`,
      results: [],
      error: `No known treasury URL for ${stateCode}`,
      manualUrl: "https://www.missingmoney.com",
    };
  }

  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    page.setDefaultTimeout(SEARCH_TIMEOUT);
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );

    try {
      await page.goto(treasuryUrl, { waitUntil: "networkidle2", timeout: NAV_TIMEOUT });
    } catch {
      return {
        source: `${stateCode} State Treasury`,
        results: [],
        error: "Could not load state treasury site",
        manualUrl: treasuryUrl,
      };
    }

    await new Promise((r) => setTimeout(r, 2000));

    const nameInputs = await page.$$("input[type='text'], input:not([type])");
    if (nameInputs.length === 0) {
      return {
        source: `${stateCode} State Treasury`,
        results: [],
        note: "Site loaded but no text inputs found — may require JavaScript interaction",
        manualUrl: treasuryUrl,
      };
    }

    const firstNameSelectors = [
      'input[name*="first" i]', 'input[id*="first" i]',
      'input[placeholder*="First" i]', 'input[aria-label*="First" i]',
      'input[name*="fname" i]', 'input[id*="fname" i]',
    ];
    const lastNameSelectors = [
      'input[name*="last" i]', 'input[id*="last" i]',
      'input[placeholder*="Last" i]', 'input[aria-label*="Last" i]',
      'input[name*="lname" i]', 'input[id*="lname" i]',
    ];

    const filledFirst = await fillInput(page, firstNameSelectors, firstName);
    const filledLast = await fillInput(page, lastNameSelectors, lastName);

    if (!filledFirst && !filledLast) {
      if (nameInputs.length >= 2) {
        await nameInputs[0].click({ clickCount: 3 });
        await nameInputs[0].type(lastName, { delay: 30 });
      } else if (nameInputs.length === 1) {
        await nameInputs[0].click({ clickCount: 3 });
        await nameInputs[0].type(`${lastName}`, { delay: 30 });
      }
    }

    const submitBtns = await page.$$('button[type="submit"], input[type="submit"], button');
    for (const btn of submitBtns) {
      const text = await btn.evaluate((el) => el.innerText?.toLowerCase() || el.value?.toLowerCase() || "");
      if (/search|find|look|submit|go/.test(text)) {
        await btn.click();
        break;
      }
    }

    await new Promise((r) => setTimeout(r, 5000));

    const results = await page.evaluate(() => {
      const items = [];
      const rows = document.querySelectorAll("table tbody tr, .result-item, [class*='result']");
      for (const row of rows) {
        const text = row.innerText?.trim();
        if (text && text.length > 5) {
          items.push({ rawText: text.slice(0, 500) });
        }
      }
      if (items.length === 0) {
        const body = document.body.innerText || "";
        if (/no results|no records|no unclaimed|nothing found|0 results/i.test(body)) {
          items.push({ rawText: "No unclaimed property found." });
        }
      }
      return items;
    });

    return {
      source: `${stateCode} State Treasury`,
      searchUrl: page.url(),
      results: results.slice(0, 20),
      resultCount: results.length,
      manualUrl: treasuryUrl,
    };
  });
}

/**
 * Run all treasury searches in parallel and return combined results.
 */
export async function runTreasurySearches(firstName, lastName, stateCode, onUpdate = () => {}) {
  const searches = [];

  onUpdate("Searching MissingMoney.com...");
  searches.push(
    searchMissingMoney(firstName, lastName, stateCode).catch((err) => ({
      source: "MissingMoney.com",
      results: [],
      error: err.message,
      manualUrl: "https://www.missingmoney.com",
    }))
  );

  if (STATE_TREASURY_URLS[stateCode]) {
    onUpdate(`Searching ${stateCode} state treasury...`);
    searches.push(
      searchStateTreasury(firstName, lastName, stateCode).catch((err) => ({
        source: `${stateCode} State Treasury`,
        results: [],
        error: err.message,
        manualUrl: STATE_TREASURY_URLS[stateCode],
      }))
    );
  }

  const results = await Promise.all(searches);
  onUpdate("Treasury searches complete.");
  return results;
}
