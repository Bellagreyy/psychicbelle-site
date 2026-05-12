// netlify/functions/session-ping.js
// Upstash Redis REST API — correct syntax

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json"
};

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY         = "psych:sessions";

async function redisGet(key) {
  try {
    const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    const data = await res.json();
    if (!data.result) return null;
    return JSON.parse(data.result);
  } catch(e) {
    console.error("redisGet error:", e.message);
    return null;
  }
}

async function redisSet(key, value) {
  try {
    // Upstash REST API: POST /set/key/value with EX param
    const encoded = encodeURIComponent(JSON.stringify(value));
    const res = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}/${encoded}?ex=300`, {
      method: "GET",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    const data = await res.json();
    console.log("redisSet response:", JSON.stringify(data));
    return data.result === "OK";
  } catch(e) {
    console.error("redisSet error:", e.message);
    return false;
  }
}

exports.handler = async function(event) {

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }

  if (!REDIS_URL || !REDIS_TOKEN) {
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ sessions: [], ok: false, error: "Redis not configured" })
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

      console.log("session-ping POST:", sessionId, pkg, status, secsRemaining);

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

      const saved = await redisSet(KEY, { sessions });
      console.log("saved to Redis:", saved, "sessions count:", sessions.length);

      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ ok: true, saved, count: sessions.length })
      };

    } catch(err) {
      console.error("POST error:", err.message);
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) };
};
