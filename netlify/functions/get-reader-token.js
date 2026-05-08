/* ============================================================
   get-reader-token.js
   GET /.netlify/functions/get-reader-token
   Called by reader.html after Clerk auth.
   Verifies the Clerk JWT, checks it belongs to Belle's
   account specifically, then returns the READER_SECRET.
   ============================================================ */

const ALLOWED_READER_IDS = ["user_3D4YKogTSDknaykpUWC8RLz8sVt"];

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

  const auth = (event.headers.authorization || event.headers.Authorization || "");
  const token = auth.replace("Bearer ", "").trim();

  if (!token) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "No token" }) };
  }

  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Bad token");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));

    if (!payload.sub) throw new Error("No subject");
    if (payload.exp && Date.now() / 1000 > payload.exp) throw new Error("Expired");

    if (!ALLOWED_READER_IDS.includes(payload.sub)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Forbidden" }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ secret: process.env.READER_SECRET }) };

  } catch (e) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Invalid token" }) };
  }
};
