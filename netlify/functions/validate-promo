// netlify/functions/validate-promo.js
// Validates a promo code before discount is applied at checkout
// Checks:
//   1. User is logged in (valid Clerk session token)
//   2. User has actually claimed this code in their Clerk account
//   3. Code has not already been used at checkout
//   4. User is not trying to stack BELLE10 + BELIEVE15 simultaneously

const https = require("https");

const VALID_CODES = {
  "BELLE10": {
    discount:      10,
    claimedField:  "belle10_claimed",
    usedField:     "belle10_used",
    conflictField: "believe15_used"
  },
  "BELIEVE15": {
    discount:      15,
    claimedField:  "first_session_completed", // requires session completed
    usedField:     "believe15_used",
    conflictField: "belle10_used",
    requiresClaim: "believe15_claimed"        // must also be claimed in portal
  }
};

exports.handler = async function (event) {
  if (event.httpMethod !== "POST")
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { userId, code } = body;
  if (!userId || !code)
    return { statusCode: 400, body: JSON.stringify({ error: "Missing userId or code" }) };

  const normalizedCode = code.toUpperCase().trim();
  const codeConfig = VALID_CODES[normalizedCode];

  if (!codeConfig)
    return { statusCode: 200, body: JSON.stringify({ valid: false, reason: "Code not recognised." }) };

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
      return { statusCode: 200, body: JSON.stringify({
        valid: false,
        reason: "This code is linked to a different account."
      })};

    // Get user metadata
    const userRes  = await clerkRequest("GET", `/v1/users/${userId}`, null, secretKey);
    const userData = JSON.parse(userRes);
    const meta     = userData.public_metadata || {};

    // Check code was claimed in portal
    if (!meta[codeConfig.claimedField])
      return { statusCode: 200, body: JSON.stringify({
        valid: false,
        reason: "This code has not been activated in your Sanctuary account."
      })};

    // For BELIEVE15 also check believe15_claimed specifically
    if (codeConfig.requiresClaim && !meta[codeConfig.requiresClaim])
      return { statusCode: 200, body: JSON.stringify({
        valid: false,
        reason: "Please claim this code in The Sanctuary first."
      })};

    // Check already used at checkout
    if (meta[codeConfig.usedField])
      return { statusCode: 200, body: JSON.stringify({
        valid: false,
        reason: "This code has already been used at checkout."
      })};

    // Check for stacking — prevent using both codes
    if (meta[codeConfig.conflictField])
      return { statusCode: 200, body: JSON.stringify({
        valid: false,
        reason: "Only one discount code can be applied per session."
      })};

    // All checks passed — mark as used and return discount
    const newMeta = Object.assign({}, meta, { [codeConfig.usedField]: true });
    await clerkRequest("PATCH", `/v1/users/${userId}`,
      JSON.stringify({ public_metadata: newMeta }), secretKey);

    return { statusCode: 200, body: JSON.stringify({
      valid:    true,
      discount: codeConfig.discount,
      code:     normalizedCode
    })};

  } catch (err) {
    console.error("validate-promo error:", err);
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
