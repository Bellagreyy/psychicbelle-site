// netlify/functions/validate-promo.js
// Validates promo codes — no npm dependencies, uses Clerk REST API directly
//
// Code types:
//   public  — anyone can use (BELLE5, seasonal)
//   member  — requires Clerk login (BELLE10)
//   session — requires login + first session completed (BELIEVE15)
//
// To add future seasonal codes — add to CODES object below, type: "public"

const CODES = {
  BELLE5: {
    type:     "public",
    discount: 5,
    active:   true
  },
  BELLE10: {
    type:     "member",
    discount: 10,
    metaKey:  "belle10_claimed",
    active:   true
  },
  BELIEVE15: {
    type:        "session",
    discount:    15,
    metaKey:     "believe15_claimed",
    requiresKey: "first_session_completed",
    active:      true
  }
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

function invalid(reason) {
  return {
    statusCode: 200,
    headers: cors,
    body: JSON.stringify({ valid: false, reason })
  };
}

function valid(code, discount, type) {
  return {
    statusCode: 200,
    headers: cors,
    body: JSON.stringify({ valid: true, code, discount, type })
  };
}

async function getClerkUser(userId) {
  try {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return null;
    const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: {
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/json"
      }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch(e) {
    console.error("Clerk fetch error:", e.message);
    return null;
  }
}

exports.handler = async function(event) {

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch(e) {}

  const code   = (body.code || "").trim().toUpperCase();
  const userId = body.userId || null;

  // Code must exist and be active
  const promo = CODES[code];
  if (!promo || !promo.active) {
    return invalid("This code is not recognised. Please check and try again.");
  }

  // PUBLIC codes — valid for anyone, no login needed
  if (promo.type === "public") {
    return valid(code, promo.discount, "public");
  }

  // MEMBER + SESSION codes require userId
  if (!userId) {
    return invalid("Please sign in to The Sanctuary to use this code.");
  }

  // Fetch user from Clerk
  const user = await getClerkUser(userId);
  if (!user) {
    return invalid("Could not verify your account. Please try again.");
  }

  const meta = user.public_metadata || {};

  // Already claimed
  if (promo.metaKey && meta[promo.metaKey] === true) {
    return invalid("This code has already been redeemed on your account.");
  }

  // SESSION codes — need first session completed
  if (promo.type === "session" && !meta[promo.requiresKey]) {
    return invalid("This code unlocks after your first session completes.");
  }

  return valid(code, promo.discount, promo.type);
};
