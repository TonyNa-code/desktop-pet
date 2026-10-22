(() => {
  const form = document.querySelector("#companion-input");
  const input = document.querySelector("#companion-text");
  const send = document.querySelector("#companion-send");
  const close = document.querySelector("#companion-close");
  const stop = document.querySelector("#companion-stop");
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
  const t = (key, values) => window.DesktopPetI18n.t(key, values || {}, state.resolvedLanguage || "en-US");
  function update() {
    const busy = sending || state.busy === true;
    const speaking = ["preparing", "playing"].includes(state.voice?.status);
    send.disabled = busy || input.disabled || !input.value.trim();
    stop.hidden = !busy;
    presence.hidden = !busy;
    presence.setAttribute("aria-label", t("pet.thinking"));
    for (const [button, key] of [[send, "quick.send"], [close, "quick.close"], [stop, "chat.stop"]]) {
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
    if (Number.isFinite(next.revision) && next.revision > revision) { revision = next.revision; sendToken++; sending = false; }
    state = next;
    draft.applyState(next);
    update();
  }
  async function submit() {
    if (sending || state.busy || input.disabled) return;
    const text = input.value.trim();
    if (!text) return;
    const context = draft.context();
    const token = ++sendToken;
    sending = true;
    feedback.hidden = true;
    draft.clearIfMatches(text);
    update();
    setOpen(false, false);
    try {
      const result = await api.sendChatMessage(text, context);
      if (token !== sendToken || result.cancelled || result.revision < revision) return;
      if (!result.ok) {
        draft.restore(text, context);
        feedback.textContent = t("quick.replyFailed"); feedback.hidden = false;
      }
    } catch {
      if (token !== sendToken) return;
      draft.restore(text, context);
      feedback.textContent = t("quick.sendFailed"); feedback.hidden = false;
    } finally {
      if (token === sendToken) { sending = false; update(); }
    }
  }
  form.addEventListener("submit", event => { event.preventDefault(); submit(); });
  input.addEventListener("input", update);
  input.addEventListener("keydown", event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); }
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); talk.focus(); }
  });
  close.addEventListener("click", () => { setOpen(false); talk.focus(); });
  stop.addEventListener("click", async () => {
    try { applyState(await api.stopChat()); }
    catch { feedback.textContent = t("quick.sendFailed"); feedback.hidden = false; }
  });
  api.onChatStateUpdated(next => { receivedState = true; applyState(next); });
  api.onChatDraftUpdated(() => update());
  api.getChatState().then(next => { if (!receivedState) applyState(next); }).catch(() => {});
  window.DesktopPetCompanionInput = { open: () => setOpen(true), toggle: () => setOpen(!open), isOpen: () => open };
})();
