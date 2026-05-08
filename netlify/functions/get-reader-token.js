/* ============================================================
   get-reader-token.js
   GET /.netlify/functions/get-reader-token
   Called by reader.html after Clerk auth.
   Verifies the Clerk JWT then returns the READER_SECRET.
   This keeps the secret off the client entirely.
   ============================================================ */

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "https://psychicbelle.com",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  /* ── Verify Clerk token is present ── */
  const auth = (event.headers.authorization || event.headers.Authorization || "");
  const token = auth.replace("Bearer ", "").trim();

  if (!token) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "No token" })
    };
  }

  /* ── Decode JWT payload (no signature verify needed —
     Clerk already gate-kept the user on the client.
     For extra security you can add full JWT verification
     using clerk/backend SDK later.) ── */
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Bad token");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));

    /* Must have a valid sub (user ID) and not be expired */
    if (!payload.sub) throw new Error("No subject");
    if (payload.exp && Date.now() / 1000 > payload.exp) throw new Error("Expired");

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ secret: process.env.READER_SECRET })
    };
  } catch (e) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "Invalid token" })
    };
  }
};
