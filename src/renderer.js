const canvas = document.querySelector("#pet");
const speechBubble = document.querySelector("#speech-bubble");
const speechCard = document.querySelector("#speech-card");
const bubbleSpeaker = document.querySelector("#bubble-speaker");
const bubbleReply = document.querySelector("#bubble-reply");
const bubbleHistory = document.querySelector("#bubble-history");
const bubblePin = document.querySelector("#bubble-pin");
const bubbleDismiss = document.querySelector("#bubble-dismiss");
const lastReplyButton = document.querySelector("#last-reply");
const talkButton = document.querySelector("#talk");
const ctx = canvas.getContext("2d", { alpha: true });
const i18n = window.DesktopPetI18n;
const SINGLE_CLICK_DELAY = 280;
const CLICK_ONLY_COOLDOWN = 220;

const FALLBACK_CHARACTER = {
  id: "default",
  name: "Default Character",
  spritePath: "../assets/characters/default/sprite.png",
  frame: { width: 768, height: 832 },
  states: {
    idle: { row: 0, frames: 6, interval: 900 },
    runningRight: { row: 1, frames: 8, interval: 100 },
    runningLeft: { row: 2, frames: 8, interval: 100 },
    waving: { row: 3, frames: 4, interval: 160 },
    jumping: { row: 4, frames: 5, interval: 140 },
    failed: { row: 5, frames: 8, interval: 220 },
    running: { row: 6, frames: 6, interval: 100 },
    review: { row: 7, frames: 6, interval: 500 },
  },
  automaticActions: ["review", "review", "waving", "jumping"],
  clickActions: ["waving", "review", "jumping", "failed"],
  staticExpressions: [
    { state: "idle", frame: 0 },
    { state: "idle", frame: 1 },
    { state: "idle", frame: 2 },
    { state: "idle", frame: 3 },
    { state: "idle", frame: 5 },
    { state: "waving", frame: 2 },
    { state: "review", frame: 1 },
    { state: "review", frame: 4 },
    { state: "failed", frame: 1 },
    { state: "failed", frame: 4 },
  ],
};

let settings = {
  language: "system",
  resolvedLanguage: "zh-CN",
  expressionMode: "automatic",
  interactionResponses: true,
  userName: "",
  scale: 1,
  alwaysOnTop: true,
  tts: { enabled: false, provider: "none", voiceName: "", rate: 1, pitch: 1 },
};
let character = FALLBACK_CHARACTER;
let spriteImage;
let state = "idle";
let frameIndex = 0;
let animationTimer;
let idleTimer;
let temporaryToken = 0;
let clickExpressionIndex = 0;
let dragInterval;
let dragStart = null;
let didDrag = false;
let clickTimer;
let clickOnlyReadyAt = 0;
let ignoreSingleClicksUntil = 0;
let hoverReadyAt = 0;
let bubbleTimer;
let didShowStartupGreeting = false;
let activeLanguage = "zh-CN";
let spriteLoadToken = 0;
let speechToken = 0;
let speechGeneration = 0;
let speechId = null;
let activeAudio = null;
let speechActive = false;
let speechWatchdog;
let conversationActive = false;
let conversationAction = "idle";
let queuedNotice = null;
let bubbleVisible = false;
let interactionReadyAt = 0;
let interactionVariants = { head: 0, greet: 0, drop: 0 };

function text(key, variables = {}) {
  return i18n.t(key, variables, activeLanguage);
}

function draw() {
  if (!spriteImage) return;
  const current = character.states[state] || character.states.idle;
  const frame = character.frame;
  const sx = (frameIndex % current.frames) * frame.width;
  const sy = current.row * frame.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(spriteImage, sx, sy, frame.width, frame.height, 0, 0, canvas.width, canvas.height);
}

function applyPetLayout() {
  const availableScale = Math.min(Number.isFinite(window.innerWidth) ? window.innerWidth / 192 : Infinity,
    Number.isFinite(window.innerHeight) ? Math.max(0, window.innerHeight - 160) / 208 : Infinity);
  const scale = Math.min(settings.scale, availableScale);
  const petWidth = Math.round(192 * scale);
  const petHeight = Math.round(208 * scale);
  document.documentElement.style.setProperty("--pet-width", `${petWidth}px`);
  document.documentElement.style.setProperty("--pet-height", `${petHeight}px`);
}

function startAnimation() {
  window.clearInterval(animationTimer);
  const current = character.states[state] || character.states.idle;
  animationTimer = window.setInterval(() => {
    if (settings.expressionMode === "clickOnly" && !dragStart) {
      draw();
      return;
    }
    // Play a conversational gesture once, then hold its expression while speaking.
    frameIndex = conversationActive && state === conversationAction
      ? Math.min(frameIndex + 1, current.frames - 1)
      : (frameIndex + 1) % current.frames;
    draw();
  }, current.interval);
  draw();
}

function setState(nextState) {
  if (!character.states[nextState]) return;
  if (state === nextState) return;
  state = nextState;
  frameIndex = 0;
  startAnimation();
}

function scheduleIdleBehavior() {
  window.clearTimeout(idleTimer);
  if (settings.expressionMode !== "automatic" || conversationActive) return;

  const delay = 22000 + Math.random() * 15000;
  idleTimer = window.setTimeout(() => {
    if (state === "idle" && !conversationActive) {
      const choices = character.automaticActions.length > 0
        ? character.automaticActions
        : FALLBACK_CHARACTER.automaticActions;
      playTemporary(choices[Math.floor(Math.random() * choices.length)], 1200);
    }
    scheduleIdleBehavior();
  }, delay);
}

function temporaryDuration(nextState) {
  if (nextState === "waving") return 1000;
  if (nextState === "failed") return 1700;
  if (nextState === "review") return 1400;
  return 1100;
}

function playTemporary(nextState, duration = temporaryDuration(nextState)) {
  if (!character.states[nextState]) return;
  window.clearTimeout(idleTimer);
  temporaryToken += 1;
  const token = temporaryToken;
  setState(nextState);
  window.setTimeout(() => {
    if (temporaryToken !== token || didDrag) return;
    setState(conversationActive ? conversationAction : "idle");
    scheduleIdleBehavior();
  }, duration);
}

function nextClickState() {
  const states = character.clickActions.length > 0 ? character.clickActions : FALLBACK_CHARACTER.clickActions;
  const nextState = states[clickExpressionIndex % states.length];
  clickExpressionIndex += 1;
  return nextState;
}

function nextStaticExpression() {
  const expressions = character.staticExpressions.length > 0
    ? character.staticExpressions
    : FALLBACK_CHARACTER.staticExpressions;
  const expression = expressions[clickExpressionIndex % expressions.length];
  clickExpressionIndex += 1;
  return [expression.state, expression.frame];
}

function setStaticExpression(nextState, nextFrame) {
  if (!character.states[nextState]) return;
  window.clearTimeout(idleTimer);
  temporaryToken += 1;
  state = nextState;
  frameIndex = Math.min(Math.max(0, nextFrame), character.states[nextState].frames - 1);
  startAnimation();
  draw();
}

function normalizeCharacter(nextCharacter) {
  const merged = { ...FALLBACK_CHARACTER, ...(nextCharacter || {}) };
  merged.frame = { ...FALLBACK_CHARACTER.frame, ...(nextCharacter?.frame || {}) };
  merged.states = nextCharacter?.states || FALLBACK_CHARACTER.states;
  merged.automaticActions = Array.isArray(nextCharacter?.automaticActions)
    ? nextCharacter.automaticActions
    : FALLBACK_CHARACTER.automaticActions;
  merged.clickActions = Array.isArray(nextCharacter?.clickActions)
    ? nextCharacter.clickActions
    : FALLBACK_CHARACTER.clickActions;
  merged.staticExpressions = Array.isArray(nextCharacter?.staticExpressions)
    ? nextCharacter.staticExpressions
    : FALLBACK_CHARACTER.staticExpressions;
  return merged;
}

function applyAppState(nextAppState = {}) {
  if (Number.isFinite(nextAppState.speechGeneration)) speechGeneration = Math.max(speechGeneration, nextAppState.speechGeneration);
  const nextCharacter = normalizeCharacter(nextAppState.activeCharacter);
  const characterChanged = nextCharacter.id !== character.id;
  const modeChanged = nextAppState.settings?.expressionMode !== settings.expressionMode;
  const previousTts = JSON.stringify(settings.tts);
  character = nextCharacter;
  settings = {
    language: nextAppState.settings?.language || nextAppState.language || "system",
    resolvedLanguage: nextAppState.resolvedLanguage || nextAppState.settings?.resolvedLanguage || "zh-CN",
    characterId: nextAppState.settings?.characterId || character.id,
    expressionMode: nextAppState.settings?.expressionMode === "clickOnly" ? "clickOnly" : "automatic",
    interactionResponses: nextAppState.settings?.interactionResponses !== false,
    userName: nextAppState.settings?.persona?.userName || "",
    characterName: nextAppState.settings?.persona?.name || character.name,
    scale: Number(nextAppState.settings?.scale) || 1,
    alwaysOnTop: nextAppState.settings?.alwaysOnTop !== false,
    tts: {
      enabled: nextAppState.settings?.tts?.enabled === true,
      provider: typeof nextAppState.settings?.tts?.provider === "string"
        ? nextAppState.settings.tts.provider
        : "none",
      voiceName: typeof nextAppState.settings?.tts?.voiceName === "string"
        ? nextAppState.settings.tts.voiceName
        : "",
      rate: Number(nextAppState.settings?.tts?.rate) || 1,
      pitch: Number(nextAppState.settings?.tts?.pitch) || 1,
    },
  };
  if (characterChanged) {
    interactionReadyAt = 0;
    interactionVariants = { head: 0, greet: 0, drop: 0 };
    clearPresentation();
  }
  else if (previousTts !== JSON.stringify(settings.tts)) {
    stopSpeech();
    if (bubbleVisible) hideBubbleLater(Math.max(3000, bubbleRemaining));
  }
  activeLanguage = settings.resolvedLanguage;
  talkButton.textContent = text("pet.talk");
  talkButton.title = text("quick.toCharacter", { name: settings.characterName });
  updateBubbleControls();
  document.documentElement.lang = activeLanguage;
  applyPetLayout();

  if (characterChanged || !spriteImage) {
    const token = ++spriteLoadToken;
    temporaryToken += 1;
    window.clearInterval(animationTimer);
    window.clearTimeout(idleTimer);
    spriteImage = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    loadSprite(character.spritePath)
      .then((image) => {
        if (token !== spriteLoadToken) return;
        spriteImage = image;
        resetAfterSettingsChange();
      })
      .catch((error) => {
        if (token === spriteLoadToken) console.error("Unable to load character sprite", error);
      });
    return;
  }

  if (modeChanged) resetAfterSettingsChange();
}

function resetAfterSettingsChange() {
  window.clearTimeout(clickTimer);
  ignoreSingleClicksUntil = 0;
  clickOnlyReadyAt = 0;
  cancelDrag();
  temporaryToken += 1;
  state = "idle";
  frameIndex = 0;
  if (settings.expressionMode === "clickOnly") {
    window.clearTimeout(idleTimer);
    const currentIndex = character.staticExpressions.findIndex((expression) => expression.state === "idle" && expression.frame === 0);
    clickExpressionIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
    setStaticExpression("idle", 0);
  } else {
    startAnimation();
    if (conversationActive && !dragStart) setState(conversationAction);
    scheduleIdleBehavior();
  }
  scheduleStartupGreeting();
}

function respondToInteraction(kind) {
  if (settings.expressionMode !== "automatic" || !settings.interactionResponses
    || conversationActive || speechActive) return;
  const choices = kind === "head" ? ["shy", "happy", "review", "idle"]
    : kind === "drop" ? ["tsundereProud", "happy", "waving", "idle"] : ["waving", "happy", "idle"];
  const action = choices.find((name) => character.states[name]);
  if (action) playTemporary(action, 1400);
  // Touches stay local and quiet; they neither replace a visible reply nor queue up.
  if (bubbleVisible || performance.now() < interactionReadyAt) return;
  interactionReadyAt = performance.now() + 6000;
  const style = character.id === "luna" ? "luna" : "default";
  const variant = interactionVariants[kind]++ % 2;
  const line = text(`pet.interaction.${style}.${kind}.${variant}`);
  showBubble(settings.userName ? text("pet.interaction.address", { name: settings.userName, line }) : line);
}

function handleClick(kind = "greet") {
  window.desktopPet.recordInteraction("click");
  if (settings.expressionMode === "clickOnly") {
    const [nextState, nextFrame] = nextStaticExpression();
    setStaticExpression(nextState, nextFrame);
  } else {
    if (conversationActive || speechActive) return;
    if (settings.interactionResponses) { respondToInteraction(kind); return; }
    const nextState = nextClickState();
    playTemporary(nextState);
  }
}

function handleDoubleClick() {
  window.clearTimeout(clickTimer);
  if (settings.expressionMode === "clickOnly" || conversationActive || speechActive) return;
  ignoreSingleClicksUntil = performance.now() + 360;
  window.desktopPet.recordInteraction("doubleClick");
  playTemporary("jumping", 1200);
}

function handleLongPress() {
  window.clearTimeout(clickTimer);
  if (settings.expressionMode === "clickOnly" || conversationActive || speechActive) return;
  window.desktopPet.recordInteraction("longPress");
  if (settings.interactionResponses) {
    respondToInteraction("head");
  } else {
    playTemporary("review", 1400);
  }
}

function scheduleSingleClick(kind) {
  window.clearTimeout(clickTimer);
  const scheduledAt = performance.now();
  clickTimer = window.setTimeout(() => {
    if (scheduledAt < ignoreSingleClicksUntil) return;
    handleClick(kind);
  }, SINGLE_CLICK_DELAY);
}

function handleClickOnlyPointerClick() {
  const now = performance.now();
  if (now < clickOnlyReadyAt) return;
  clickOnlyReadyAt = now + CLICK_ONLY_COOLDOWN;
  handleClick();
}

function beginDrag(event) {
  if (event.button !== 0) return;
  window.clearTimeout(clickTimer);
  const bounds = canvas.getBoundingClientRect();
  dragStart = {
    x: event.screenX,
    y: event.screenY,
    time: performance.now(),
    kind: (event.clientY - bounds.top) / bounds.height < 0.46 ? "head" : "greet",
    expression: { state, frame: frameIndex },
  };
  didDrag = false;
  canvas.classList.add("dragging");
  window.desktopPet.dragStart();
  window.clearInterval(dragInterval);
  dragInterval = window.setInterval(async () => {
    if (!dragStart) return;
    const activeDrag = dragStart;
    let movement;
    try {
      movement = await window.desktopPet.dragMove();
    } catch {
      return;
    }
    if (dragStart !== activeDrag) return;
    if (Math.abs(movement.dx) > 2 || Math.abs(movement.dy) > 2) {
      didDrag = true;
      if (Math.abs(movement.dx) > 4) {
        setState(movement.dx > 0 ? "runningRight" : "runningLeft");
      } else {
        setState("running");
      }
    }
  }, 16);
}

function endDrag(event) {
  if (!dragStart) return;
  window.clearInterval(dragInterval);
  window.desktopPet.dragEnd();
  canvas.classList.remove("dragging");

  const heldDuration = performance.now() - dragStart.time;
  const { kind, expression } = dragStart;
  dragStart = null;

  if (didDrag) {
    didDrag = false;
    if (settings.expressionMode === "clickOnly") {
      setStaticExpression(expression?.state || "idle", expression?.frame || 0);
    } else {
      setState(conversationActive ? conversationAction : "idle");
      scheduleIdleBehavior();
      respondToInteraction("drop");
    }
    return;
  }

  if (heldDuration > 450) {
    if (settings.expressionMode !== "clickOnly") handleLongPress();
    return;
  }
  if (settings.expressionMode === "clickOnly") {
    if (event.detail > 1) return;
    handleClickOnlyPointerClick();
    return;
  }
  if (event.detail > 1) return;
  scheduleSingleClick(kind);
}

let bubbleDeadline = 0;
let bubbleRemaining = 0;
let bubblePaused = false;
let bubbleStreaming = false;
let bubblePinned = false;
let bubbleHovered = false;
let bubbleFocused = false;
let presentationId = null;
let dismissedPresentationId = null;

function updateBubbleControls() {
  const name = settings.characterName || character.name;
  bubbleSpeaker.textContent = name;
  bubbleSpeaker.title = name;
  for (const [button, key] of [[bubbleReply, "pet.reply"], [bubbleHistory, "pet.openChat"],
    [bubblePin, bubblePinned ? "pet.unpinReply" : "pet.pinReply"], [bubbleDismiss, "pet.dismissReply"],
    [lastReplyButton, "pet.lastReply"]]) {
    button.title = text(key);
    button.setAttribute("aria-label", button.title);
  }
  speechBubble.setAttribute("aria-label", name);
  bubblePin.setAttribute("aria-pressed", String(bubblePinned));
}

function dismissBubble() {
  window.clearTimeout(bubbleTimer);
  speechCard.hidden = true;
  speechBubble.classList.remove("visible");
  bubbleVisible = false;
  bubblePinned = false;
  bubbleHovered = false;
  bubbleFocused = false;
  bubblePaused = false;
  updateBubbleControls();
  conversationActive = false;
  conversationAction = "idle";
  temporaryToken += 1;
  if (settings.expressionMode === "automatic" && !dragStart) setState("idle");
  scheduleIdleBehavior();
  const pending = queuedNotice;
  queuedNotice = null;
  if (pending && pending.expiresAt > Date.now()) handlePetMessage(pending.message);
}

function clearPresentation() {
  queuedNotice = null;
  bubbleStreaming = false;
  bubblePaused = false;
  presentationId = null;
  dismissedPresentationId = null;
  stopSpeech();
  dismissBubble();
  speechBubble.textContent = "";
}

function hideBubbleLater(duration) {
  window.clearTimeout(bubbleTimer);
  bubbleRemaining = duration;
  bubbleDeadline = Date.now() + duration;
  if (bubbleVisible && !bubblePaused && !bubblePinned && !bubbleStreaming && !speechActive) bubbleTimer = window.setTimeout(dismissBubble, duration);
}

function showBubble(text, duration = Math.min(22000, Math.max(4500, String(text || "").length * 110))) {
  if (!speechBubble || !text) return;
  window.clearTimeout(bubbleTimer);
  const continuing = speechBubble.textContent && String(text).startsWith(speechBubble.textContent);
  const follow = continuing && speechBubble.scrollHeight - speechBubble.scrollTop - speechBubble.clientHeight < 24;
  if (speechBubble.textContent !== String(text)) speechBubble.textContent = text;
  if (follow) speechBubble.scrollTop = speechBubble.scrollHeight;
  else if (!continuing) speechBubble.scrollTop = 0;
  speechBubble.classList.add("visible");
  speechCard.hidden = false;
  bubbleVisible = true;
  hideBubbleLater(duration);
}

function pauseBubble() {
  const paused = bubbleHovered || bubbleFocused;
  if (paused === bubblePaused) return;
  if (paused) {
    bubbleRemaining = Math.max(3000, bubbleDeadline - Date.now());
    window.clearTimeout(bubbleTimer);
  }
  bubblePaused = paused;
  if (!paused) hideBubbleLater(Math.max(3000, bubbleRemaining));
}

speechCard.addEventListener("mouseenter", () => { bubbleHovered = true; pauseBubble(); });
speechCard.addEventListener("mouseleave", () => { bubbleHovered = false; pauseBubble(); });
speechCard.addEventListener("pointerdown", () => { bubbleFocused = false; pauseBubble(); });
speechCard.addEventListener("focusin", (event) => { bubbleFocused = event.target.matches(":focus-visible"); pauseBubble(); });
speechCard.addEventListener("focusout", (event) => { bubbleFocused = bubbleFocused && speechCard.contains(event.relatedTarget); pauseBubble(); });
speechCard.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    bubbleFocused = true;
    pauseBubble();
    return;
  }
  event.preventDefault();
  closeBubble();
  talkButton.focus();
});
function closeBubble() {
  // Later chunks still enter chat history, but must not reopen a dismissed reply.
  if (presentationId !== null) dismissedPresentationId = presentationId;
  queuedNotice = null;
  bubbleStreaming = false;
  stopSpeech();
  window.desktopPet.stopVoice();
  dismissBubble();
}
bubbleDismiss.addEventListener("click", closeBubble);
bubblePin.addEventListener("click", () => {
  bubblePinned = !bubblePinned;
  updateBubbleControls();
  hideBubbleLater(Math.max(3000, bubbleRemaining));
});
bubbleReply.addEventListener("click", () => window.desktopPet.openQuickChatWindow());
bubbleHistory.addEventListener("click", () => window.desktopPet.openChatWindow());
lastReplyButton.addEventListener("click", () => window.desktopPet.showLastReply());
talkButton.addEventListener("click", () => window.desktopPet.openQuickChatWindow());

function finishSpeech(token, failed = false) {
  if (token !== speechToken) return;
  stopSpeech(failed ? "error" : "idle");
  if (bubbleVisible) hideBubbleLater(Math.max(3000, bubbleRemaining));
}

function chooseTtsVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  if (settings.tts.voiceName) {
    const exact = voices.find((voice) => voice.name === settings.tts.voiceName);
    if (exact) return exact;
  }
  const languagePrefix = activeLanguage.split("-")[0];
  return voices.find((voice) => voice.lang && voice.lang.toLowerCase().startsWith(languagePrefix))
    || voices.find((voice) => /^zh/i.test(voice.lang))
    || voices.find((voice) => /^ja|^en/i.test(voice.lang))
    || voices[0];
}

function stopSpeech(status = "idle") {
  speechToken += 1;
  speechActive = false;
  if (speechId !== null) window.desktopPet.speechStateChanged({ id: speechId, status });
  speechId = null;
  window.clearTimeout(speechWatchdog);
  if (activeAudio) {
    activeAudio.onended = null;
    activeAudio.onerror = null;
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio = null;
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

async function speakText(text) {
  stopSpeech();
  const token = speechToken;
  if (!settings.tts?.enabled || settings.tts.provider === "none" || !String(text || "").trim()) return;
  speechActive = true;
  window.clearTimeout(bubbleTimer);
  try {
    const id = await window.desktopPet.beginSpeech(speechGeneration);
    if (token !== speechToken) {
      if (id !== null) window.desktopPet.speechStateChanged({ id, status: "idle" });
      return;
    }
    if (id === null) { finishSpeech(token); return; }
    speechId = id;
    const external = settings.tts.provider !== "system";
    const chunks = window.DesktopPetSpeechText.splitSpeechText(text, external ? 800 : 400);
    let index = 0;
    const playNext = async () => {
      if (token !== speechToken) return;
      if (index === chunks.length) { finishSpeech(token); return; }
      const chunk = chunks[index++];
      window.clearTimeout(speechWatchdog);
      speechWatchdog = window.setTimeout(() => finishSpeech(token, true), 300000);
      window.desktopPet.speechStateChanged({ id, status: "preparing" });
      try {
        if (external) {
          const result = await window.desktopPet.synthesizeSpeech({ id, text: chunk });
          if (token !== speechToken) return;
          if (!result?.ok || !result.audioDataUrl) { finishSpeech(token, !result?.cancelled); return; }
          activeAudio = new Audio(result.audioDataUrl);
          activeAudio.onended = playNext;
          activeAudio.onerror = () => finishSpeech(token, true);
          await activeAudio.play();
          if (token === speechToken) window.desktopPet.speechStateChanged({ id, status: "playing" });
        } else {
          if (!("speechSynthesis" in window)) { finishSpeech(token, true); return; }
          const utterance = new SpeechSynthesisUtterance(chunk);
          const voice = chooseTtsVoice();
          if (voice) utterance.voice = voice;
          utterance.rate = Math.min(Math.max(Number(settings.tts.rate) || 1, 0.5), 1.8);
          utterance.pitch = Math.min(Math.max(Number(settings.tts.pitch) || 1, 0.5), 1.8);
          utterance.onstart = () => {
            if (token === speechToken) window.desktopPet.speechStateChanged({ id, status: "playing" });
          };
          utterance.onend = playNext;
          utterance.onerror = () => finishSpeech(token, true);
          window.speechSynthesis.speak(utterance);
        }
      } catch { finishSpeech(token, true); }
    };
    await playNext();
  } catch {
    finishSpeech(token, true);
  }
}

window.desktopPet.onSpeechStopped((generation) => {
  speechGeneration = Math.max(speechGeneration, generation);
  stopSpeech();
  if (bubbleVisible) hideBubbleLater(Math.max(3000, bubbleRemaining));
});

function handlePetMessage(message = {}) {
  if (message.clear) {
    clearPresentation();
    return;
  }
  const isChat = message.source === "chat";
  if (isChat && message.presentationId != null && message.presentationId === dismissedPresentationId) return;
  if (!isChat && (conversationActive || speechActive || bubblePinned)) {
    // Keep only the latest recent reminder; never replay a backlog after a chat.
    queuedNotice = { message, expiresAt: Date.now() + 60000 };
    return;
  }
  const wasStreaming = bubbleStreaming;
  const nextPresentationId = isChat ? message.presentationId ?? null : null;
  if (nextPresentationId !== presentationId || !isChat) {
    bubblePinned = message.pinned === true;
    presentationId = nextPresentationId;
    updateBubbleControls();
  }
  bubbleStreaming = message.streaming === true;
  const text = typeof message === "string" ? message : message.text;
  const bubbleText = typeof message === "object" && message.bubbleText ? message.bubbleText : text;
  const action = typeof message === "object" ? message.action : "";
  if (isChat) {
    if (!conversationActive || (!wasStreaming && bubbleStreaming)) conversationAction = "idle";
    conversationActive = true;
    if (action && character.states[action]) conversationAction = action;
    window.clearTimeout(idleTimer);
    temporaryToken += 1;
  }
  stopSpeech();
  showBubble(bubbleText, message.duration);
  if (typeof message !== "object" || message.speak !== false) {
    speakText(text);
  }
  if (settings.expressionMode === "automatic" && !dragStart) {
    if (isChat) setState(conversationAction);
    else if (action && character.states[action]) playTemporary(action, Math.max(temporaryDuration(action), 1200));
  }
  if (message.notification) window.desktopPet.presentNotification?.(message.notification);
}

function startupGreetingText() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return text("pet.greeting.morning");
  if (hour >= 11 && hour < 14) return text("pet.greeting.noon");
  if (hour >= 14 && hour < 18) return text("pet.greeting.afternoon");
  if (hour >= 18 && hour < 23) return text("pet.greeting.evening");
  return text("pet.greeting.night");
}

function scheduleStartupGreeting() {
  if (didShowStartupGreeting) return;
  didShowStartupGreeting = true;
  window.setTimeout(() => {
    handlePetMessage({ text: startupGreetingText(), action: "waving", duration: 2800, speak: false });
  }, 650);
}

function loadSprite(spritePath) {
  return new Promise((resolve, reject) => {
    const nextImage = new Image();
    nextImage.addEventListener("load", () => {
      resolve(nextImage);
    }, { once: true });
    nextImage.addEventListener("error", reject, { once: true });
    nextImage.src = spritePath;
  });
}

canvas.addEventListener("pointerdown", beginDrag);
canvas.addEventListener("dblclick", handleDoubleClick);
canvas.addEventListener("pointerenter", () => {
  if (settings.expressionMode !== "automatic" || conversationActive || dragStart || performance.now() < hoverReadyAt) return;
  hoverReadyAt = performance.now() + 10000;
  if (state === "idle") playTemporary("waving", 900);
});
window.addEventListener("pointerup", endDrag);
function cancelDrag() {
  if (!dragStart) return;
  const expression = dragStart.expression;
  dragStart = null;
  didDrag = false;
  window.clearInterval(dragInterval);
  window.desktopPet.dragEnd();
  canvas.classList.remove("dragging");
  if (settings.expressionMode === "automatic") setState(conversationActive ? conversationAction : "idle");
  else if (expression) setStaticExpression(expression.state, expression.frame);
}
window.addEventListener("blur", cancelDrag);
window.addEventListener("resize", applyPetLayout);
window.addEventListener("pointercancel", cancelDrag);

window.addEventListener("contextmenu", (event) => {
  if (speechBubble.contains(event.target)) return;
  event.preventDefault();
  window.desktopPet.showContextMenu();
});

window.desktopPet.onAppStateUpdated(applyAppState);
window.desktopPet.onPetMessage(handlePetMessage);

let receivedChatUpdate = false;
function updateReplyAvailability(chatState) {
  lastReplyButton.disabled = !chatState.canShowLastReply;
}
window.desktopPet.onChatStateUpdated((chatState) => {
  receivedChatUpdate = true;
  updateReplyAvailability(chatState);
});
window.desktopPet.getChatState().then((chatState) => {
  if (!receivedChatUpdate) updateReplyAvailability(chatState);
}).catch(() => {});

window.desktopPet.getAppState()
  .then((initialAppState) => {
    applyAppState(initialAppState);
  })
  .catch((error) => {
    console.error("Unable to start Desktop Pet", error);
  });
