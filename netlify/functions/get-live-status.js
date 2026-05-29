exports.handler = async () => {
  try {
    var res = await fetch(
      process.env.UPSTASH_REDIS_REST_URL + "/get/live_status",
      { headers: { Authorization: "Bearer " + process.env.UPSTASH_REDIS_REST_TOKEN } }
    );
    var data = await res.json();
    var live = data.result === null ? true : data.result === "true";
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify({ live })
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ live: true }) };
  }
};
