exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { email, firstName } = body;
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_KEY}`,
    "revision": "2024-02-15",
  };

  // Step 1: Create/update profile with first name
  await fetch("https://a.klaviyo.com/api/profiles/", {
    method: "POST",
    headers,
    body: JSON.stringify({
      data: {
        type: "profile",
        attributes: {
          email,
          first_name: firstName || "",
        },
      },
    }),
  }).catch(() => {});

  // Step 2: Subscribe to list
  const response = await fetch("https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/", {
    method: "POST",
    headers,
    body: JSON.stringify({
      data: {
        type: "profile-subscription-bulk-create-job",
        attributes: {
          profiles: {
            data: [
              {
                type: "profile",
                attributes: {
                  email,
                  subscriptions: {
                    email: {
                      marketing: {
                        consent: "SUBSCRIBED",
                      },
                    },
                  },
                },
              },
            ],
          },
        },
        relationships: {
          list: {
            data: {
              type: "list",
              id: "T9vepx",
            },
          },
        },
      },
    }),
  });

  if (response.status !== 202 && response.status !== 200) {
    const err = await response.text();
    console.error("Klaviyo error:", err);
    return { statusCode: response.status, body: err };
  }

  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};
