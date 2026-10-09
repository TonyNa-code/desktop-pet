function expressionInstruction(states) {
  const allowed = Object.keys(states).filter((name) => /^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(name));
  return `You are speaking as the character beside the user's desktop. Reply naturally in character, usually in one to three sentences unless the user asks for more. Do not narrate software status or numeric energy. Start with exactly one expression marker chosen from: ${allowed.map((name) => `[expression:${name}]`).join(" ")}. Then write the spoken reply. The marker controls the character's expression and is not spoken. Do not invent other markers.`;
}

function parseCompanionReply(raw, states, partial = false) {
  const value = String(raw || "").trimStart();
  const marker = /^\[expression:([^\]\r\n]{0,80})\]\s*/i.exec(value);
  if (marker) return { text: partial ? value.slice(marker[0].length) : value.slice(marker[0].length).trim(), action: Object.hasOwn(states, marker[1]) ? marker[1] : "" };
  if (partial && ("[expression:".startsWith(value.toLowerCase()) || /^\[expression:[^\]\r\n]{0,80}$/i.test(value))) return { text: "", action: "" };
  return { text: partial ? value : value.trim(), action: "" };
}

module.exports = { expressionInstruction, parseCompanionReply };
