// netlify/functions/complete-session.js
// Called when the session timer hits zero in portal.html
// Sets first_session_completed: true in Clerk publicMetadata
// This unlocks the BELIEVE15 loyalty reward

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
    // Verify session token
    const verifyRes = await clerkRequest("GET",
      `/v1/sessions/verify?token=${encodeURIComponent(sessionToken)}`, null, secretKey);
    const session = JSON.parse(verifyRes);
    if (!session || session.user_id !== userId)
      return { statusCode: 403, body: JSON.stringify({ error: "Token mismatch" }) };

    // Get current metadata
    const userRes  = await clerkRequest("GET", `/v1/users/${userId}`, null, secretKey);
    const userData = JSON.parse(userRes);
    const meta     = userData.public_metadata || {};

    // Already completed — idempotent, just return success
    if (meta.first_session_completed)
      return { statusCode: 200, body: JSON.stringify({ success: true, alreadySet: true }) };

    // Set first_session_completed
    const newMeta = Object.assign({}, meta, { first_session_completed: true });
    await clerkRequest("PATCH", `/v1/users/${userId}`,
      JSON.stringify({ public_metadata: newMeta }), secretKey);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error("complete-session error:", err);
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
