const test = require("node:test");
const assert = require("node:assert/strict");
const { chatHttpIssue, chatReadIssue, retryAfterSeconds } = require("../src/chat-diagnostics");
const i18n = require("../src/i18n");
const { loadMain } = require("./helpers");
const { loadPet } = require("./pet-helpers");

const en = (key, vars) => i18n.t(key, vars, "en-US");
const localSettings = 'settings = normalizeSettings({language:"en-US",assistant:{baseUrl:"https://test.example/v1",model:"fixture"}})';

test("chat and connection tests agree on the cause without quoting upstream bodies", async () => {
  for (const [status, key, settingsSuggested] of [
    [400,"parameters",true], [401,"credentials",true], [402,"quota",false],
    [403,"access",true], [404,"endpoint",true], [408,"timeout",false], [413,"length",false],
    [422,"parameters",true], [429,"limit",false], [500,"service",false],
    [503,"service",false], [504,"timeout",false], [418,"rejected",false],
  ]) {
    let calls = 0;
    const app = loadMain({fetch: async () => { calls++; return new Response("private upstream echo", { status }); }});
    app.run(localSettings);
    const reply = await app.run('requestAssistantReply("Hello")');
    const check = await app.run("testAssistantConnection(null)");
    assert.equal(reply.ok, false);
    assert.equal(check.ok, false);
    assert.equal(reply.settingsSuggested, settingsSuggested);
    assert.equal(reply.reply, en("chatError." + key) + " (HTTP " + status + ")");
    assert.equal(check.message, reply.reply);
    assert.equal(calls, 2);
  }
});

test("rate limits display valid provider wait hints; confirmed quota exhaustion does not suggest retrying", async () => {
  for (const language of ["en-US","zh-CN","ja-JP"]) {
    const t = (key, vars) => i18n.t(key, vars, language);
    for (const [status, delay, key, count] of [[429,"15","waitSeconds",15],[503,"121","waitMinutes",3]]) {
      const issue = await chatHttpIssue(new Response(null, { status, headers: { "retry-after": delay } }), t);
      assert.ok(issue.message.includes(t("chatError." + key, { count })));
      assert.equal(issue.settingsSuggested, false);
    }
    for (const field of ["code","type"]) {
      const response = Response.json({ error:{ [field]:"insufficient_quota",message:"untrusted message" } },
        { status:429, headers:{"retry-after":"10"} });
      assert.equal((await chatHttpIssue(response, t)).message, t("chatError.quota") + " (HTTP 429)");
    }
  }
  const large = Response.json({error:{type:"insufficient_quota"}}, { status:429, headers:{"content-length":"9999999"} });
  assert.equal((await chatHttpIssue(large, en)).message, en("chatError.limit") + " (HTTP 429)");
});

test("retry-after accepts seconds or future HTTP dates and ignores unusable values", () => {
  const now = Date.UTC(2026, 10, 6, 12);
  assert.equal(retryAfterSeconds(new Date(now + 30000).toUTCString(), now), 30);
  for (const value of ["-8","NaN","1.5","0","9999999999999999","yesterday",new Date(now-60000).toUTCString()]) {
    assert.equal(retryAfterSeconds(value, now), 0);
  }
});

test("model discovery uses a list-specific 404 and never echoes the provider body", async () => {
  const app = loadMain({ fetch: async () => new Response("private detail", {status:404}) });
  app.run(localSettings);
  const r = await app.run('listAssistantModels(null,{language:"ja-JP"})');
  assert.equal(r.message, i18n.t("chatError.modelList", {}, "ja-JP") + " (HTTP 404)");
});

test("protocol and size errors are distinct from a timeout or an unreachable service", () => {
  for (const [error, aborted, key] of [[new SyntaxError(),false,"format"],[Error("invalid_reply"),false,"format"],
    [Error("incomplete_stream"),false,"interrupted"],[Error("response_too_large"),false,"largeReply"],
    [Error("private network detail"),true,"timeout"],[new TypeError("private network detail"),false,"connection"]]) {
    assert.equal(chatReadIssue(error, aborted, en).message, en("chatError." + key));
  }
  for (const error of [new TypeError("socket closed"), new SyntaxError("truncated JSON")]) {
    assert.deepEqual(chatReadIssue(error, false, en, true), { message: en("chatError.interrupted"), settingsSuggested: false });
  }
});

test("an interrupted SSE keeps partial text out of speech, recall and future model context", async () => {
  let calls = 0;
  const app = loadMain({fetch: async () => { calls++; return new Response('data: {"choices":[{"delta":{"content":"[expression:happy] Almost there"}}]}\n\n',
    {headers:{"content-type":"text/event-stream"}}); }});
  app.run(localSettings);
  app.run('globalThis.sent = []; mainWindow = {isDestroyed:()=>false,webContents:{send:(topic,data)=>sent.push({topic,data})}}');
  const result = await app.run('sendChatMessage(null,"Say something")');
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.match(result.message.content, /interrupted/);
  assert.match(result.message.content, /Partial reply:\nAlmost there$/);
  assert.doesNotMatch(result.message.content, /expression:/);
  assert.equal(result.message.failed, true);
  assert.equal(app.run('JSON.stringify(llmMessagesFor("Next")).includes("Almost there")'), false);
  const bubble = app.run('sent.filter(e=>e.topic==="pet-message").at(-1).data');
  assert.equal(bubble.bubbleText, result.message.content);
  assert.equal(bubble.speak, false);
  assert.equal(app.run("chatState().canShowLastReply"), false);
});

test("the settings shortcut belongs only to the current actionable error bubble", () => {
  const opened = [];
  const pet = loadPet({ openCompanionSettings: tab => opened.push(tab) });
  const button = pet.nodes.get("#bubble-chat-settings");
  pet.run('handlePetMessage({source:"chat",presentationId:1,text:"Credentials",serviceNotice:true,settingsSuggested:true,speak:false})');
  assert.equal(button.hidden,false);
  assert.equal(pet.nodes.get("#bubble-speaker").textContent, pet.run('text("chatError.source")'));
  button.events.click();
  assert.deepEqual(opened,["chat"]);
  pet.run('handlePetMessage({source:"chat",presentationId:2,text:"Wait",speak:false})');
  assert.equal(button.hidden,true);
  assert.equal(pet.nodes.get("#bubble-speaker").textContent, pet.run("settings.characterName || character.name"));
  pet.run('clearPresentation(); showBubble("Local time")');
  assert.equal(button.hidden,true);
});
