exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { Allow: "POST" },
      body: "Method Not Allowed",
    };
  }

  // Optional secret check
  const expected = process.env.GQ_SECRET;
  const provided =
    event.headers["x-guildquality-signature"] ||
    event.headers["x-gq-signature"];

  if (expected && expected !== provided) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  // Parse payload
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const data = payload.data || {};
  const contact = data.contact || {};
  const questions = Array.isArray(data.questions) ? data.questions : [];

  // ---------- helpers ----------
  const findQuestionByName = (targetName) => {
    const t = String(targetName).toLowerCase();
    return questions.find((q) => String(q.name || "").toLowerCase() === t);
  };

  const commentOrDefault = (q) => {
    const c = q && typeof q.comment === "string" ? q.comment.trim() : "";
    return c ? c : "(no comment)";
  };

  // Ratings are now 0–10 / 1–10; display as "10/10"
  const ratingOutOf10 = (q) => {
    const n = Number(q?.rating);
    if (!Number.isFinite(n)) return "N/A";
    // If your scale is 0-10, 10 is still max. We’ll display /10.
    return `${n}/10`;
  };

  // mcs response is an array like ["Yes"] or ["No"]; if missing/empty => skipped
  // returns: ✅ / ❌ / ❔
  const yesNoSkippedEmoji = (q) => {
    const resp = q?.response;
    if (!Array.isArray(resp) || resp.length === 0) return "❔"; // skipped
    const v = String(resp[0] ?? "").trim().toLowerCase();
    if (v === "yes") return "✅";
    if (v === "no") return "❌";
    return "❔"; // unknown/other treated as skipped
  };

  // ---------- customer ----------
  const name = contact.name || data.displayName || "Unknown customer";

  // ---------- satisfaction ----------
  const scoreNum = Number(data.satisfactionScore);
  const satisfactionLine = Number.isFinite(scoreNum) ? `${scoreNum}%` : "No score given";

  // ---------- kickoff / walkthrough ----------
  const kickOffQ = findQuestionByName("Project Kick-Off");
  const finalWalkQ = findQuestionByName("Final Walkthrough");

  const kickOffLine = `${yesNoSkippedEmoji(kickOffQ)} Project Kick-Off`;
  const finalWalkLine = `${yesNoSkippedEmoji(finalWalkQ)} Final Walkthrough`;

  // ---------- rating questions ----------
  const ltrQ = findQuestionByName("Likely To Recommend");
  const commQ = findQuestionByName("Communication");
  const proQ = findQuestionByName("Professional & Organized");

  // ---------- build message ----------
  const lines = [];
  lines.push("📝 New GuildQuality survey");
  lines.push(`Customer: ${name}`);
  lines.push(`Satisfaction Rating: ${satisfactionLine}`);
  lines.push("");
  lines.push(kickOffLine);
  lines.push(finalWalkLine);
  lines.push("");

  lines.push(`Likely To Recommend: ${ratingOutOf10(ltrQ)}`);
  lines.push(`Comments: ${commentOrDefault(ltrQ)}`);
  lines.push("");

  lines.push(`Communication: ${ratingOutOf10(commQ)}`);
  lines.push(`Comments: ${commentOrDefault(commQ)}`);
  lines.push("");

  lines.push(`Professional & Organized: ${ratingOutOf10(proQ)}`);
  lines.push(`Comments: ${commentOrDefault(proQ)}`);

  // Optional: include Additional Comments if they ever fill it out
  const addlQ = findQuestionByName("Additional Comments");
  const addlComment = addlQ && typeof addlQ.comment === "string" ? addlQ.comment.trim() : "";
  if (addlComment) {
    lines.push("");
    lines.push("Additional Comments:");
    lines.push(addlComment);
  }

  const message = { text: lines.join("\n") };

  // ---------- send to Google Chat ----------
  const resp = await fetch(process.env.CHAT_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });

  if (!resp.ok) {
    const body = await resp.text();
    return { statusCode: 502, body: `Chat webhook error: ${resp.status} ${body}` };
  }

  return { statusCode: 200, body: "OK" };
};
