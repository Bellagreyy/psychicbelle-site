// netlify/functions/claim.js
//
// This function runs server-side on Netlify.
// It receives a verified Clerk session token,
// confirms the user identity, then writes
// { belle10_claimed: true } to their publicMetadata
// via the Clerk Backend API.
//
// Environment variable required in Netlify:
//   CLERK_SECRET_KEY = sk_test_xxxxxxxxxxxx
//   (set in Netlify → Site configuration → Environment variables)

const https = require("https");

exports.handler = async function (event) {
  /* Only allow POST */
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  /* Parse body */
  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { userId } = body;
  if (!userId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing userId" }) };
  }

  /* Verify the bearer token matches the userId */
  const authHeader = event.headers["authorization"] || "";
  const sessionToken = authHeader.replace("Bearer ", "");
  if (!sessionToken) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorised" }) };
  }

  /* Verify token with Clerk */
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error("CLERK_SECRET_KEY not set in environment variables");
    return { statusCode: 500, body: JSON.stringify({ error: "Server configuration error" }) };
  }

  try {
    /* Verify the session token and get claims */
    const verifyRes = await clerkRequest(
      "GET",
      `/v1/sessions/verify?token=${encodeURIComponent(sessionToken)}`,
      null,
      secretKey
    );

    const session = JSON.parse(verifyRes);

    /* Confirm the session belongs to the claimed userId */
    if (!session || session.user_id !== userId) {
      return { statusCode: 403, body: JSON.stringify({ error: "Token does not match userId" }) };
    }

    /* Check if already claimed to prevent double-redemption */
    const userRes = await clerkRequest("GET", `/v1/users/${userId}`, null, secretKey);
    const userData = JSON.parse(userRes);

    if (userData.public_metadata && userData.public_metadata.belle10_claimed === true) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "Already claimed", alreadyClaimed: true })
      };
    }

    /* Write belle10_claimed: true to publicMetadata */
    const currentMeta = userData.public_metadata || {};
    const newMeta = Object.assign({}, currentMeta, { belle10_claimed: true });

    await clerkRequest(
      "PATCH",
      `/v1/users/${userId}`,
      JSON.stringify({ public_metadata: newMeta }),
      secretKey
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: "Credit claimed successfully" })
    };

  } catch (err) {
    console.error("Clerk API error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error", detail: err.message })
    };
  }
};

/* ── Minimal HTTPS helper for Clerk API calls ── */
function clerkRequest(method, path, body, secretKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.clerk.com",
      port: 443,
      path: path,
      method: method,
      headers: {
        "Authorization": "Bearer " + secretKey,
        "Content-Type": "application/json"
      }
    };

    if (body) {
      options.headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error("Clerk API error " + res.statusCode + ": " + data));
        } else {
          resolve(data);
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
