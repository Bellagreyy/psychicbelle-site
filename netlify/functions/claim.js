// netlify/functions/claim.js
// Handles BELLE10 claim — saves belle10_claimed: true
// and belle10_claimed_at: timestamp for BELIEVE15 3-day window
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

  const authHeader = event.headers["authorization"] || "";
  if (!authHeader.startsWith("Bearer "))
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorised" }) };

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey)
    return { statusCode: 500, body: JSON.stringify({ error: "Server config error" }) };

  try {
    const userRes  = await clerkRequest("GET", `/v1/users/${userId}`, null, secretKey);
    const userData = JSON.parse(userRes);

    if (userData.public_metadata && userData.public_metadata.belle10_claimed === true)
      return { statusCode: 409, body: JSON.stringify({ error: "Already claimed" }) };

    const current = userData.public_metadata || {};
    const newMeta = Object.assign({}, current, {
      belle10_claimed:    true,
      belle10_claimed_at: Date.now()
    });

    await clerkRequest("PATCH", `/v1/users/${userId}`,
      JSON.stringify({ public_metadata: newMeta }), secretKey);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error("claim.js error:", err);
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
