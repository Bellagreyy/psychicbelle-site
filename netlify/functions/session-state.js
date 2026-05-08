/* ============================================================
   session-state.js
   GET /.netlify/functions/session-state
   Called by reader.html every 5 seconds.
   Returns all active sessions (ended sessions excluded if
   ended more than 30s ago).
   Secured by a shared READER_SECRET env var checked against
   ?secret=xxx query param — set this in Netlify env vars.
   ============================================================ */

const { sessions } = require("./session-ping");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  /* ── Auth: simple secret query param ── */
  const secret = (event.queryStringParameters || {}).secret || "";
  const expected = process.env.READER_SECRET || "";

  if (!expected || secret !== expected) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "Unauthorized" })
    };
  }

  /* ── Return active sessions ── */
  const now = Date.now();
  const active = Object.values(sessions).filter(s => {
    /* Keep sessions updated in the last 30s, or ended within 30s */
    if (s.status === "ended") {
      return (now - s.updatedAt) < 30000;
    }
    /* Consider stale (client tab closed) if no ping for 25s */
    return (now - s.updatedAt) < 25000;
  });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      sessions: active,
      serverTime: now
    })
  };
};
