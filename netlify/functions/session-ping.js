// netlify/functions/session-ping.js
exports.handler = async function(event) {
  const cors = {
    "Access-Control-Allow-Origin": "https://psychicbelle.com",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }

  try {
    const { getStore } = require("@netlify/blobs");
    const store = getStore({ name: "psych-sessions", consistency: "strong" });

    if (event.httpMethod === "GET") {
      let sessions = [];
      try {
        const raw = await store.get("active", { type: "json" });
        if (raw && Array.isArray(raw.sessions)) {
          const cutoff = Date.now() - 25000;
          sessions = raw.sessions.filter(function(s) { return s.updatedAt > cutoff; });
          if (sessions.length !== raw.sessions.length) {
            await store.set("active", JSON.stringify({ sessions: sessions }));
          }
        }
      } catch(e) { sessions = []; }
      return { statusCode: 200, headers: cors, body: JSON.stringify({ sessions: sessions }) };
    }

    if (event.httpMethod === "POST") {
      var body = JSON.parse(event.body || "{}");
      var sessionId    = body.sessionId;
      var clientName   = body.clientName || "Client";
      var pkg          = body.pkg || "unknown";
      var secsRemaining = body.secsRemaining || 0;
      var totalSecs    = body.totalSecs || 0;
      var status       = body.status || "active";
      var evt          = body.event || "ping";

      if (!sessionId) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing sessionId" }) };
      }

      var sessions = [];
      try {
        var raw = await store.get("active", { type: "json" });
        if (raw && Array.isArray(raw.sessions)) sessions = raw.sessions;
      } catch(e) {}

      sessions = sessions.filter(function(s) { return s.sessionId !== sessionId; });

      if (status === "ended" || secsRemaining <= 0) {
        await store.set("active", JSON.stringify({ sessions: sessions }));
        return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, removed: true }) };
      }

      sessions.push({
        sessionId:     sessionId,
        clientName:    clientName,
        pkg:           pkg,
        secsRemaining: Math.max(0, secsRemaining),
        totalSecs:     totalSecs,
        status:        status,
        event:         evt,
        updatedAt:     Date.now()
      });

      await store.set("active", JSON.stringify({ sessions: sessions }));
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) };

  } catch(err) {
    console.error("session-ping error:", err.message);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "https://psychicbelle.com", "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message, sessions: [] })
    };
  }
};
