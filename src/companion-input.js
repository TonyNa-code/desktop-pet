(() => {
  const form = document.querySelector("#companion-input");
  const input = document.querySelector("#companion-text");
  const send = document.querySelector("#companion-send");
  const close = document.querySelector("#companion-close");
  const stop = document.querySelector("#companion-stop");
  const retry = document.querySelector("#companion-retry");
  const presence = document.querySelector("#companion-presence");
  const feedback = document.querySelector("#companion-feedback");
  const talk = document.querySelector("#talk");
  const api = window.desktopPet;
  const draft = window.DesktopPetDraft.create(input, { autofocus: false });
  let open = false;
  let state = {};
  let sending = false;
  let sendToken = 0;
  let revision = 0;
  let receivedState = false;
  let opening = 0;
  let errorKey = "";
  const t = (key, values) => window.DesktopPetI18n.t(key, values || {}, state.resolvedLanguage || "en-US");
  function needsSetup() {
    return !state.config?.assistant?.baseUrl || !state.config?.assistant?.model;
  }
  function failedTurn() {
    const reply = state.history?.at(-1);
    const message = state.history?.at(-2);
    return reply?.role === "assistant" && reply.failed && message?.role === "user" && message.failed
      ? { text: message.content, replyAt: reply.createdAt } : null;
  }
  function update() {
    const busy = sending || state.busy === true;
    const speaking = ["preparing", "playing"].includes(state.voice?.status);
    const setup = needsSetup();
    send.disabled = busy || input.disabled || (!setup && !input.value.trim());
    send.dataset.setup = String(setup);
    retry.hidden = busy || setup || !failedTurn();
    retry.querySelector("span").textContent = t("chat.retry");
    const hint = input.disabled ? "" : setup ? "quick.notConnected" : errorKey;
    feedback.textContent = hint ? t(hint) : "";
    feedback.hidden = !hint;
    stop.hidden = !busy;
    presence.hidden = !busy;
    presence.setAttribute("aria-label", t("pet.thinking"));
    for (const [button, key] of [[send, setup ? "quick.connectService" : "quick.send"], [close, "quick.close"], [stop, "chat.stop"], [retry, "pet.retryMessage"]]) {
      button.title = t(key); button.setAttribute("aria-label", button.title);
    }
    input.placeholder = t("quick.toCharacter", { name: state.config?.persona?.name || state.character?.name || "Desktop Pet" });
    input.setAttribute("aria-label", input.placeholder);
    const attention = busy ? "thinking" : speaking ? "speaking" : open ? "attentive" : "idle";
    window.DesktopPetModel?.presence(attention);
    document.body.dataset.companionState = attention;
  }
  async function setOpen(value, focus = true) {
    const ticket = ++opening;
    open = value;
    form.hidden = !open;
    document.body.dataset.companionOpen = String(open);
    talk.setAttribute("aria-expanded", String(open));
    if (!open) input.blur();
    update();
    try {
      await api.setCompanionInputOpen(open);
      if (ticket !== opening) return;
      window.dispatchEvent(new Event("resize"));
      if (open && focus) input.focus();
    } catch {
      if (ticket !== opening) return;
      open = false; form.hidden = true; document.body.dataset.companionOpen = "false";
      talk.setAttribute("aria-expanded", "false"); update();
    }
  }
  function applyState(next) {
    if (Number.isFinite(next.revision) && next.revision < revision) return;
    if (Number.isFinite(next.revision) && next.revision > revision) { revision = next.revision; sendToken++; sending = false; errorKey = ""; }
    state = next;
    if (next.busy) errorKey = "";
    draft.applyState(next);
    update();
  }
  async function submit(turn) {
    if (sending || state.busy || input.disabled) return;
    if (needsSetup()) {
      if (!turn) api.openCompanionSettings("chat");
      return;
    }
    const text = turn ? turn.text : input.value.trim();
    if (!text) return;
    const context = draft.context();
    const token = ++sendToken;
    sending = true;
    errorKey = "";
    const usedDraft = input.value.trim() === text;
    if (usedDraft) draft.clearIfMatches(text);
    update();
    if (open && (!turn || usedDraft)) setOpen(false, false);
    try {
      const result = await api.sendChatMessage(text, turn ? { ...context, retryOf: turn.replyAt } : context);
      if (token !== sendToken || result.revision < revision) return;
      if (result.cancelled) {
        if (usedDraft) draft.restore(text, context);
        return;
      }
      if (!result.ok) {
        draft.restore(text, context);
        errorKey = "quick.replyFailed";
      }
    } catch {
      if (token !== sendToken) return;
      draft.restore(text, context);
      errorKey = "quick.sendFailed";
    } finally {
      if (token === sendToken) { sending = false; update(); }
    }
  }
  form.addEventListener("submit", event => { event.preventDefault(); submit(); });
  input.addEventListener("input", () => { errorKey = ""; update(); });
  input.addEventListener("keydown", event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); }
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); talk.focus(); }
  });
  close.addEventListener("click", () => { setOpen(false); talk.focus(); });
  retry.addEventListener("click", () => {
    const turn = failedTurn();
    if (turn) submit(turn);
  });
  stop.addEventListener("click", async () => {
    try { applyState(await api.stopChat()); }
    catch { errorKey = "quick.sendFailed"; update(); }
  });
  api.onChatStateUpdated(next => { receivedState = true; applyState(next); });
  api.onChatDraftUpdated(() => update());
  api.getChatState().then(next => { if (!receivedState) applyState(next); }).catch(() => {});
  window.DesktopPetCompanionInput = { open: () => setOpen(true), toggle: () => setOpen(!open), isOpen: () => open };
})();
