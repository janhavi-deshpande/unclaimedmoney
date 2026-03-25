function sendJson(res, statusCode, body) {
  res.status(statusCode).json(body);
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method Not Allowed" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return sendJson(res, 500, { error: "Missing OPENROUTER_API_KEY in server environment." });
  }

  try {
    const parsed = parseBody(req);
    const { firstName, lastName, state, eligibility = [] } = parsed;

    if (!firstName || !lastName || !state) {
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
      return sendJson(res, 502, {
        error: "OpenRouter request failed.",
        details: errText.slice(0, 500),
      });
    }

    const json = await openRouterRes.json();
    const content = json?.choices?.[0]?.message?.content || "{}";
    const result = JSON.parse(content);
    return sendJson(res, 200, result);
  } catch (err) {
    if (err?.name === "AbortError") {
      return sendJson(res, 504, { error: "Upstream AI request timed out. Please retry." });
    }
    return sendJson(res, 500, { error: err?.message || "Server error." });
  }
}
