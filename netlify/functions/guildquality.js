exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { Allow: 'POST' },
      body: 'Method Not Allowed',
    };
  }

  // Optional secret check
  const expected = process.env.GQ_SECRET;
  const provided =
    event.headers['x-guildquality-signature'] ||
    event.headers['x-gq-signature'];

  if (expected && expected !== provided) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  // Parse payload
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const data = payload.data || {};
  const contact = data.contact || {};
  const questions = Array.isArray(data.questions) ? data.questions : [];

  // ----- helpers -----
  const findQuestionByName = (targetName) => {
    const t = targetName.toLowerCase();
    return questions.find((q) => (q.name || '').toLowerCase() === t);
  };

  const makeStars = (val) => {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return '(no rating)';
    return '⭐'.repeat(Math.round(n));
  };

  const getCommentOrDefault = (q) => {
    const txt = (q && typeof q.comment === 'string' && q.comment.trim()) || '';
    return txt || '(no comment)';
  };

  // ----- customer name -----
  const name = contact.name || data.displayName || 'Unknown customer';

  // ----- satisfaction rating -----
  let satisfactionLine = 'No score given';
  const rawScore = data.satisfactionScore;
  const scoreNum = Number(rawScore);

  if (Number.isFinite(scoreNum)) {
    satisfactionLine = `${scoreNum}%`;
  }

  // ----- Site Visits (Project Kick-Off / Final Walkthrough) -----
  const siteVisitsQ = findQuestionByName('Site Visits');
  const responses = Array.isArray(siteVisitsQ?.response)
    ? siteVisitsQ.response
    : [];

  const hasKickOff = responses.includes('Project Kick-Off');
  const hasFinal = responses.includes('Final Walkthrough');

  const lineKickOff = `${hasKickOff ? '✅' : '❌'} Project Kick-Off`;
  const lineFinal = `${hasFinal ? '✅' : '❌'} Final Walkthrough`;

  // ----- Rating blocks -----
  const ltrQ = findQuestionByName('Likely To Recommend');
  const commQ = findQuestionByName('Communication');
  const proQ = findQuestionByName('Professional & Organized');

  const ltrStars = makeStars(ltrQ?.rating);
  const commStars = makeStars(commQ?.rating);
  const proStars = makeStars(proQ?.rating);

  const ltrComment = getCommentOrDefault(ltrQ);
  const commComment = getCommentOrDefault(commQ);
  const proComment = getCommentOrDefault(proQ);

  // ----- Build message text -----
  const lines = [];

  lines.push('📝 New GuildQuality survey');
  lines.push(`Customer: ${name}`);
  lines.push(`Satisfaction Rating: ${satisfactionLine}`);
  lines.push('');
  lines.push(lineKickOff);
  lines.push(lineFinal);
  lines.push('');
  lines.push(`Likely To Recommend: ${ltrStars}`);
  lines.push(`Comments: ${ltrComment}`);
  lines.push('');
  lines.push(`Communication: ${commStars}`);
  lines.push(`Comments: ${commComment}`);
  lines.push('');
  lines.push(`Professional & Organized: ${proStars}`);
  lines.push(`Comments: ${proComment}`);

  const message = { text: lines.join('\n') };

  // ----- Send to Google Chat -----
  const resp = await fetch(process.env.CHAT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });

  if (!resp.ok) {
    const body = await resp.text();
    return {
      statusCode: 502,
      body: `Chat webhook error: ${resp.status} ${body}`,
    };
  }

  return { statusCode: 200, body: 'OK' };
};
