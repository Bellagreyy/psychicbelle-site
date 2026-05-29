exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  const auth = event.headers["authorization"] || "";
  const secret = auth.replace("Bearer ", "");
  if (secret !== process.env.READER_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorised" }) };
  }
  try {
    const { live } = JSON.parse(event.body);
    var res = await fetch(
      process.env.UPSTASH_REDIS_REST_URL + "/set/live_status/" + String(live),
      {
        method: "GET",
        headers: { Authorization: "Bearer " + process.env.UPSTASH_REDIS_REST_TOKEN }
      }
    );
    var data = await res.json();
    return {
      statusCode: 200,
      body: JSON.stringify({ live, updated: true })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
