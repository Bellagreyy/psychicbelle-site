const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  // Auth check — same secret as get-reader-token
  const auth = event.headers["authorization"] || "";
  const secret = auth.replace("Bearer ", "");
  if (secret !== process.env.READER_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorised" }) };
  }

  try {
    const { live } = JSON.parse(event.body);
    const store = getStore("site-config");
    await store.set("live_status", String(live));
    return {
      statusCode: 200,
      body: JSON.stringify({ live, updated: true })
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
