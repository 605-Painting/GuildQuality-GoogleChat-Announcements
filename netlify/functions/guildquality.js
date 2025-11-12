exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { Allow: 'POST' }, body: 'Method Not Allowed' };
  }

  // Secret check (optional but recommended)
  const expected = process.env.GQ_SECRET;
  const provided =
    event.headers['x-guildquality-signature'] ||
    event.headers['x-gq-signature'];
  if (expected && expected !== provided) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  // Parse payload safely
  let survey;
  try {
    survey = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // Build a simple Chat message
  const customer = survey?.customer?.name ?? 'Unknown customer';
  const rating = survey?.overallRating ?? 'N/A';
  const comment = survey?.comment ?? '(no comment)';
  const message = {
    text: `📝 New GuildQuality survey\nCustomer: ${customer}\nRating: ${rating}\nComments: ${comment}`
  };

  // Send to Google Chat (env var!)
  const resp = await fetch(process.env.CHAT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  });

  if (!resp.ok) {
    const body = await resp.text();
    return { statusCode: 502, body: `Chat webhook error: ${resp.status} ${body}` };
  }
  return { statusCode: 200, body: 'OK' };
};
