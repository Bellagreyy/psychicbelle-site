exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { email, firstName, answers } = JSON.parse(event.body);

  const response = await fetch("https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "revision": "2024-02-15",
      "Authorization": "Klaviyo-API-Key " + process.env.KLAVIYO_PRIVATE_KEY
    },
    body: JSON.stringify({
      data: {
        type: "profile-subscription-bulk-create-job",
        attributes: {
          profiles: {
            data: [{
              type: "profile",
              attributes: {
                email: email,
                first_name: firstName,
                properties: {
                  situation: answers[0] || "",
                  energy_felt: answers[1] || "",
                  fear: answers[2] || "",
                  intuition: answers[3] || "",
                  need: answers[4] || ""
                },
                subscriptions: {
                  email: { marketing: { consent: "SUBSCRIBED" } }
                }
              }
            }]
          }
        },
        relationships: {
          list: { data: { type: "list", id: "T9vepx" } }
        }
      }
    })
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true })
  };
};
