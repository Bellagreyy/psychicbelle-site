// netlify/functions/session-ping.js
exports.handler = async function(event) {

  // Open CORS — allow any origin so reader.html can poll
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }

  try {
    const { getStore } = require("@netlify/blobs");
    const store = getStore({ name: "psych-sessions", consistency: "strong" });

    // GET — reader.html polling for active sessions
    if (event.httpMethod === "GET") {
      let sessions = [];
      try {
        const raw = await store.get("active", { type: "json" });
        if (raw && Array.isArray(raw.sessions)) {
          const cutoff = Date.now() - 30000; // 30s stale threshold
          sessions = raw.sessions.filter(s => s.updatedAt > cutoff);
          // Clean up stale sessions if any removed
          if (sessions.length !== raw.sessions.length) {
            await store.set("active", JSON.stringify({ sessions }));
          }
        }
      } catch(e) {
        sessions = [];
      }
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ sessions, ok: true })
      };
    }

    // POST — client browser posting session state
    if (event.httpMethod === "POST") {
      let body = {};
      try { body = JSON.parse(event.body || "{}"); } catch(e) {}

      const {
        sessionId,
        clientName   = "Client",
        pkg          = "unknown",
        secsRemaining = 0,
        totalSecs    = 0,
        status       = "active",
        event: evt   = "ping"
      } = body;

      if (!sessionId) {
        return {
          statusCode: 400,
          headers: cors,
          body: JSON.stringify({ error: "Missing sessionId" })
        };
      }

      // Load existing sessions
      let sessions = [];
      try {
        const raw = await store.get("active", { type: "json" });
        if (raw && Array.isArray(raw.sessions)) sessions = raw.sessions;
      } catch(e) {}

      // Remove this session from list (will re-add if still active)
      sessions = sessions.filter(s => s.sessionId !== sessionId);

      // If ended — just remove, don't re-add
      if (status === "ended" || secsRemaining <= 0) {
        await store.set("active", JSON.stringify({ sessions }));
        return {
          statusCode: 200,
          headers: cors,
          body: JSON.stringify({ ok: true, removed: true })
        };
      }

      // Add updated session state
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

      await store.set("active", JSON.stringify({ sessions }));

      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ ok: true })
      };
    }

    return {
      statusCode: 405,
      headers: cors,
      body: JSON.stringify({ error: "Method not allowed" })
    };

  } catch(err) {
    console.error("session-ping error:", err.message);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ error: err.message, sessions: [] })
    };
  }
};
