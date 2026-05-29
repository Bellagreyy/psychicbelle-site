const { getStore } = require("@netlify/blobs");

exports.handler = async () => {
  try {
    const store = getStore("site-config");
    const val = await store.get("live_status");
    const live = val === null ? true : val === "true";
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify({ live })
    };
  } catch (e) {
    return {
      statusCode: 200,
      body: JSON.stringify({ live: true })
    };
  }
};
