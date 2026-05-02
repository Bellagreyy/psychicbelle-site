// netlify/functions/claim-believe15.js
// Handles BELIEVE15 claim
// Requires: first_session_completed: true (set when timer hits zero)
// Prevents: claiming if belle10 not yet used, or already claimed

const https = require("https");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST")
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { userId } = body;
  if (!userId)
    return { statusCode: 400, body: JSON.stringify({ error: "Missing userId" }) };

  const authHeader   = event.headers["authorization"] || "";
  const sessionToken = authHeader.replace("Bearer ", "");
  if (!sessionToken)
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorised" }) };

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey)
    return { statusCode: 500, body: JSON.stringify({ error: "Server config error" }) };

  try {
    const verifyRes = await clerkRequest("GET",
      `/v1/sessions/verify?token=${encodeURIComponent(sessionToken)}`, null, secretKey);
    const session = JSON.parse(verifyRes);
    if (!session || session.user_id !== userId)
      return { statusCode: 403, body: JSON.stringify({ error: "Token mismatch" }) };

    const userRes  = await clerkRequest("GET", `/v1/users/${userId}`, null, secretKey);
    const userData = JSON.parse(userRes);
    const meta     = userData.public_metadata || {};

    // Must have claimed BELLE10
    if (!meta.belle10_claimed)
      return { statusCode: 403, body: JSON.stringify({
        error: "BELLE10 must be claimed first"
      })};

    // Must have completed first session
    if (!meta.first_session_completed)
      return { statusCode: 403, body: JSON.stringify({
        error: "Complete your first session to unlock this reward"
      })};

    // Already claimed
    if (meta.believe15_claimed)
      return { statusCode: 409, body: JSON.stringify({ error: "Already claimed" }) };

    const newMeta = Object.assign({}, meta, { believe15_claimed: true });
    await clerkRequest("PATCH", `/v1/users/${userId}`,
      JSON.stringify({ public_metadata: newMeta }), secretKey);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error("claim-believe15 error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function clerkRequest(method, path, body, secretKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.clerk.com", port: 443, path, method,
      headers: { "Authorization": "Bearer " + secretKey, "Content-Type": "application/json" }
    };
    if (body) options.headers["Content-Length"] = Buffer.byteLength(body);
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error("Clerk " + res.statusCode + ": " + data));
        else resolve(data);
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
