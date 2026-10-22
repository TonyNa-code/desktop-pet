(() => {
  const controls = document.querySelector("#voice-controls");
  const button = document.querySelector("#voice-toggle");
  const status = document.querySelector("#voice-status");
  let current = {};
  let pending = false;
  let receivedUpdate = false;

  function render(state) {
    current = state;
    const language = state.resolvedLanguage || state.config?.resolvedLanguage || "en-US";
    const t = (key) => window.DesktopPetI18n.t(key, {}, language);
    const voice = state.voice || {};
    const active = ["preparing", "playing"].includes(voice.status);
    const messages = document.querySelector("#messages");
    const wasNearBottom = messages && messages.scrollHeight - messages.scrollTop - messages.clientHeight < 60;
    controls.hidden = !voice.enabled || (!active && !voice.canReplay);
    document.body.classList.toggle("has-voice-controls", !controls.hidden);
    if (controls.dataset.compact === "true") {
      button.querySelector("img").src = `./icons/${active ? "square" : "volume-2"}.svg`;
    } else button.textContent = t(active ? "voice.stop" : "voice.replay");
    button.title = t(active ? "voice.stop" : "voice.replayTitle");
    button.setAttribute("aria-label", button.title);
    button.disabled = pending || (!active && !voice.canReplay);
    status.textContent = t(active ? `voice.${voice.status}` : state.voiceError ? "voice.failed" : "voice.ready");
    if (wasNearBottom) messages.scrollTop = messages.scrollHeight;
  }

  button.addEventListener("click", async () => {
    if (pending) return;
    pending = true;
    const active = ["preparing", "playing"].includes(current.voice?.status);
    render(current);
    try {
      // State broadcasts are authoritative; an invoke result can arrive after a newer playback event.
      if (active) await window.desktopPet.stopVoice();
      else await window.desktopPet.replaySpeech();
    } catch {
      status.textContent = window.DesktopPetI18n.t("voice.failed", {}, current.resolvedLanguage || "en-US");
    } finally {
      pending = false;
      button.disabled = !["preparing", "playing"].includes(current.voice?.status) && !current.voice?.canReplay;
    }
  });
  window.desktopPet.onChatStateUpdated((state) => { receivedUpdate = true; render(state); });
  window.desktopPet.getChatState().then((state) => { if (!receivedUpdate) render(state); }).catch(() => {});
})();
