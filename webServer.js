import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function handleScan(req, res) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("[scan] Missing OPENROUTER_API_KEY in server environment");
    return sendJson(res, 500, {
      error: "Missing OPENROUTER_API_KEY in server environment.",
    });
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      const parsed = JSON.parse(body || "{}");
      const { firstName, lastName, state, eligibility = [] } = parsed;
      console.log(`[scan] request for ${firstName || "?"} ${lastName || "?"} in ${state || "?"}`);

      if (!firstName || !lastName || !state) {
        console.error("[scan] Missing required input fields");
        return sendJson(res, 400, { error: "Missing required input fields." });
      }

      const prompt = `You are a financial discovery assistant.
Find potential unclaimed money resources and active class action settlements for:
- Name: ${firstName} ${lastName}
- State: ${state}
- Eligibility clues: ${eligibility.join(", ") || "general consumer"}

Return STRICT JSON only in this exact shape:
{
  "matches": [
    {
      "title": "string",
      "description": "string",
      "estimatedValue": "string",
      "link": "https://...",
      "sourceType": "Treasury|ClassAction"
    }
  ]
}

Rules:
- Prefer official treasury/property sites and known settlement administrator pages.
- Do not fabricate certainty. Keep descriptions cautious and concise.
- If payout unknown, use "TBD".`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      let openRouterRes;
      try {
        openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
            max_tokens: 800,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!openRouterRes.ok) {
        const errText = await openRouterRes.text();
        console.error("[scan] OpenRouter request failed", openRouterRes.status, errText.slice(0, 500));
        return sendJson(res, 502, {
          error: "OpenRouter request failed.",
          details: errText.slice(0, 500),
        });
      }

      const json = await openRouterRes.json();
      const content = json?.choices?.[0]?.message?.content || "{}";
      const result = JSON.parse(content);
      console.log(`[scan] success: ${Array.isArray(result.matches) ? result.matches.length : 0} matches`);
      return sendJson(res, 200, result);
    } catch (err) {
      if (err?.name === "AbortError") {
        return sendJson(res, 504, { error: "Upstream AI request timed out. Please retry." });
      }
      console.error("[scan] Unhandled server error", err);
      return sendJson(res, 500, { error: err.message || "Server error." });
    }
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/scan") {
    return handleScan(req, res);
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end("Method Not Allowed");
    return;
  }

  const reqPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirname, safePath);

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType =
      ext === ".html"
        ? "text/html; charset=utf-8"
        : ext === ".js"
          ? "text/javascript; charset=utf-8"
          : ext === ".css"
            ? "text/css; charset=utf-8"
            : "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    if (req.method === "HEAD") {
      res.end();
    } else {
      res.end(file);
    }
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  }
});

server.listen(PORT, () => {
  console.log(`Web UI server running at http://localhost:${PORT}`);
});
