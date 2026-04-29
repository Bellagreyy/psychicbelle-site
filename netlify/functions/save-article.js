// netlify/functions/save-article.js
//
// Saves an article ID to user.publicMetadata.saved_articles array
// Called from article.html when a logged-in user clicks "Save to Sanctuary"
//
// Environment variable required: CLERK_SECRET_KEY

const https = require("https");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { userId, articleId } = body;
  if (!userId || articleId === undefined) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing userId or articleId" }) };
  }

  const authHeader = event.headers["authorization"] || "";
  const sessionToken = authHeader.replace("Bearer ", "");
  if (!sessionToken) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorised" }) };
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server configuration error" }) };
  }

  try {
    /* Verify session token */
    const verifyRes = await clerkRequest(
      "GET",
      `/v1/sessions/verify?token=${encodeURIComponent(sessionToken)}`,
      null,
      secretKey
    );
    const session = JSON.parse(verifyRes);
    if (!session || session.user_id !== userId) {
      return { statusCode: 403, body: JSON.stringify({ error: "Token mismatch" }) };
    }

    /* Get current metadata */
    const userRes  = await clerkRequest("GET", `/v1/users/${userId}`, null, secretKey);
    const userData = JSON.parse(userRes);
    const current  = userData.public_metadata || {};
    const saved    = Array.isArray(current.saved_articles) ? current.saved_articles : [];

    /* Add article ID if not already saved */
    if (saved.indexOf(articleId) === -1) {
      saved.push(articleId);
    }

    const newMeta = Object.assign({}, current, { saved_articles: saved });

    await clerkRequest(
      "PATCH",
      `/v1/users/${userId}`,
      JSON.stringify({ public_metadata: newMeta }),
      secretKey
    );

    return { statusCode: 200, body: JSON.stringify({ success: true, saved_articles: saved }) };

  } catch (err) {
    console.error("save-article error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function clerkRequest(method, path, body, secretKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.clerk.com",
      port: 443, path, method,
      headers: {
        "Authorization": "Bearer " + secretKey,
        "Content-Type": "application/json"
      }
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
