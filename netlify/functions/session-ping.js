// netlify/functions/session-ping.js
// Uses Upstash Redis REST API — no npm package, free tier
// Setup: create free account at upstash.com, create Redis database,
// add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to Netlify env vars

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json"
};

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY         = "psych:sessions";
const TTL         = 60; // seconds — auto-expire sessions after 60s of no ping

async function redisGet(key) {
  try {
    const res = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    const data = await res.json();
    if (!data.result) return null;
    return JSON.parse(data.result);
  } catch(e) { return null; }
}

async function redisSet(key, value) {
  try {
    await fetch(`${REDIS_URL}/set/${key}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ value: JSON.stringify(value), ex: 300 })
    });
  } catch(e) {}
}

exports.handler = async function(event) {

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }

  // No Redis configured — return empty gracefully
  if (!REDIS_URL || !REDIS_TOKEN) {
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ sessions: [], ok: true, note: "Redis not configured" })
    };
  }

  // GET — reader.html polling
  if (event.httpMethod === "GET") {
    try {
      const raw = await redisGet(KEY);
      let sessions = (raw && Array.isArray(raw.sessions)) ? raw.sessions : [];
      const cutoff = Date.now() - 30000;
      sessions = sessions.filter(s => s.updatedAt > cutoff);
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ sessions, ok: true })
      };
    } catch(e) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ sessions: [], ok: true }) };
    }
  }

  // POST — client posting session state
  if (event.httpMethod === "POST") {
    try {
      let body = {};
      try { body = JSON.parse(event.body || "{}"); } catch(e) {}

      const sessionId     = body.sessionId;
      const clientName    = body.clientName || "Client";
      const pkg           = body.pkg || "unknown";
      const secsRemaining = body.secsRemaining || 0;
      const totalSecs     = body.totalSecs || 0;
      const status        = body.status || "active";
      const evt           = body.event || "ping";

      if (!sessionId) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing sessionId" }) };
      }

      const raw = await redisGet(KEY);
      let sessions = (raw && Array.isArray(raw.sessions)) ? raw.sessions : [];
      sessions = sessions.filter(s => s.sessionId !== sessionId);

      if (status === "ended" || secsRemaining <= 0) {
        await redisSet(KEY, { sessions });
        return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, removed: true }) };
      }

      sessions.push({
        sessionId,
        clientName,
        pkg,
        secsRemaining: Math.max(0, secsRemaining),
        totalSecs,
        status,
        event: evt,
        updatedAt: Date.now()
      });

      await redisSet(KEY, { sessions });

      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };

    } catch(err) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) };
};
