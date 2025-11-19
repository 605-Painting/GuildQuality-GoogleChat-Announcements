exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { Allow: 'POST' }, body: 'Method Not Allowed' };
  }

  // Optional secret check
  const expected = process.env.GQ_SECRET;
  const provided =
    event.headers['x-guildquality-signature'] ||
    event.headers['x-gq-signature'];
  if (expected && expected !== provided) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  // Parse safely
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // --- TEMP: log the raw payload so we can see real field names in Netlify logs ---
  console.log('GQ payload sample:', JSON.stringify(payload, null, 2));

  // Helpers to safely read
  const contact = payload.contact || payload.customer || {};
  const project = payload.project || {};

  const name =
    contact.full_name ||
    [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
    contact.name ||
    project.customer_name ||
    project.client_name ||
    'Unknown customer';

  // Answers often come as arrays. Support several likely keys.
  const answers =
    payload.answers ||
    payload.survey_answers ||
    payload.response_answers ||
    payload.responses ||
    [];

  // Try to find a numeric rating by question label or key
  const ratingAliases = [
    'likely to recommend',
    'overall satisfaction',
    'nps',
    'net promoter',
    'overall rating',
  ];
  const pickRating = () => {
    // Look through answers; support shapes like { question, label, key, value, answer }
    for (const a of Array.isArray(answers) ? answers : []) {
      const label =
        (a.label || a.question_label || a.question || a.key || '').toString().toLowerCase();
      const val = a.value ?? a.answer ?? a.score ?? a.rating;
      const looksNumeric = typeof val === 'number' || (!isNaN(parseFloat(val)) && isFinite(val));
      if (ratingAliases.some(alias => label.includes(alias)) && looksNumeric) {
        return typeof val === 'number' ? val : parseFloat(val);
      }
    }
    return null;
  };

  // Try to find a free-text comment
  const commentAliases = ['comment', 'review', 'feedback', 'notes'];
  const pickComment = () => {
    // direct fields first
    if (payload.comment || payload.public_comment || payload.review?.comment) {
      return payload.comment || payload.public_comment || payload.review?.comment;
    }
    // scan answers for a text response tied to comment-like labels
    for (const a of Array.isArray(answers) ? answers : []) {
      const label =
        (a.label || a.question_label || a.question || a.key || '').toString().toLowerCase();
      const val = a.value ?? a.answer ?? a.text ?? a.comment;
      if (commentAliases.some(alias => label.includes(alias)) && typeof val === 'string' && val.trim()) {
        return val.trim();
      }
    }
    return '';
  };

  const rating = pickRating();
  const comment = pickComment();

  const message = {
    text:
      `📝 New GuildQuality survey\n` +
      `Customer: ${name}\n` +
      `Rating: ${rating ?? 'N/A'}\n` +
      `Comments: ${comment || '(no comment)'}`
  };

  // Send to Google Chat
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
