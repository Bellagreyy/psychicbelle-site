/* ============================================================
   session-ping.js
   POST /.netlify/functions/session-ping
   Called by the client page every 10s and on key events.
   Stores session state in a module-level object (persists for
   the lifetime of the Lambda warm instance — sufficient for
   single-reader use; swap for Netlify KV / Redis later).
   ============================================================ */

const sessions = {}; /* { sessionId: { ...state, updatedAt } } */

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "https://psychicbelle.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const {
    sessionId,   /* unique per session — pkg+timestamp set at Start Session */
    clientName,  /* from Clerk user firstName, or "Client" fallback */
    pkg,         /* "starter" | "standard" | "premium" */
    secsRemaining,
    totalSecs,
    status,      /* "active" | "paused" | "ended" */
    event: evt   /* "start" | "ping" | "pause" | "resume" | "topup" | "end" | "alert_3min" | "alert_1min" */
  } = body;

  if (!sessionId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "sessionId required" }) };
  }

  sessions[sessionId] = {
    sessionId,
    clientName: clientName || "Client",
    pkg: pkg || "unknown",
    secsRemaining: typeof secsRemaining === "number" ? secsRemaining : 0,
    totalSecs: typeof totalSecs === "number" ? totalSecs : 0,
    status: status || "active",
    lastEvent: evt || "ping",
    updatedAt: Date.now()
  };

  /* Prune sessions older than 4 hours */
  const cutoff = Date.now() - (4 * 60 * 60 * 1000);
  for (const id of Object.keys(sessions)) {
    if (sessions[id].updatedAt < cutoff) delete sessions[id];
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, sessionId })
  };
};

/* Export sessions so session-state.js can share the same module cache */
exports.sessions = sessions;
