// netlify/functions/session-ping.js
// Uses Netlify Blobs REST API directly — no npm package needed

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json"
};

// Netlify Blobs REST API helpers
// These env vars are automatically available in Netlify functions
function getBlobUrl(key) {
  const siteId  = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  const token   = process.env.NETLIFY_BLOBS_TOKEN || process.env.TOKEN;
  return { siteId, token };
}

async function blobGet(key) {
  try {
    const siteId = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token  = process.env.NETLIFY_BLOBS_TOKEN || process.env.TOKEN;
    if (!siteId || !token) return null;
    const url = `https://api.netlify.com/api/v1/sites/${siteId}/blobs/${encodeURIComponent(key)}?context=production`;
    const res = await fetch(url, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const text = await res.text();
    return JSON.parse(text);
  } catch(e) { return null; }
}

async function blobSet(key, data) {
  try {
    const siteId = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token  = process.env.NETLIFY_BLOBS_TOKEN || process.env.TOKEN;
    if (!siteId || !token) return false;
    const url = `https://api.netlify.com/api/v1/sites/${siteId}/blobs/${encodeURIComponent(key)}?context=production`;
    await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });
    return true;
  } catch(e) { return false; }
}

exports.handler = async function(event) {

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }

  // GET — reader.html polling for active sessions
  if (event.httpMethod === "GET") {
    try {
      const raw = await blobGet("psych-active-sessions");
      let sessions = [];
      if (raw && Array.isArray(raw.sessions)) {
        const cutoff = Date.now() - 30000;
        sessions = raw.sessions.filter(s => s.updatedAt > cutoff);
      }
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ sessions, ok: true })
      };
    } catch(e) {
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ sessions: [], ok: true })
      };
    }
  }

  // POST — client browser posting session state
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
        return {
          statusCode: 400,
          headers: cors,
          body: JSON.stringify({ error: "Missing sessionId" })
        };
      }

      // Load existing sessions
      const raw = await blobGet("psych-active-sessions");
      let sessions = (raw && Array.isArray(raw.sessions)) ? raw.sessions : [];

      // Remove this session
      sessions = sessions.filter(s => s.sessionId !== sessionId);

      // If ended — just remove
      if (status === "ended" || secsRemaining <= 0) {
        await blobSet("psych-active-sessions", { sessions });
        return {
          statusCode: 200,
          headers: cors,
          body: JSON.stringify({ ok: true, removed: true })
        };
      }

      // Add updated session
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

      await blobSet("psych-active-sessions", { sessions });

      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ ok: true })
      };

    } catch(err) {
      console.error("session-ping POST error:", err.message);
      return {
        statusCode: 500,
        headers: cors,
        body: JSON.stringify({ error: err.message })
      };
    }
  }

  return {
    statusCode: 405,
    headers: cors,
    body: JSON.stringify({ error: "Method not allowed" })
  };
};
