const canvas = document.querySelector("#pet");
const speechBubble = document.querySelector("#speech-bubble");
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
  const petWidth = Math.round(192 * settings.scale);
  const petHeight = Math.round(208 * settings.scale);
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
    frameIndex = (frameIndex + 1) % current.frames;
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
  if (settings.expressionMode !== "automatic") return;

  const delay = 22000 + Math.random() * 15000;
  idleTimer = window.setTimeout(() => {
    if (state === "idle") {
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
    setState("idle");
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
  const nextCharacter = normalizeCharacter(nextAppState.activeCharacter);
  const characterChanged = nextCharacter.id !== character.id;
  const modeChanged = nextAppState.settings?.expressionMode !== settings.expressionMode;
  character = nextCharacter;
  settings = {
    language: nextAppState.settings?.language || nextAppState.language || "system",
    resolvedLanguage: nextAppState.resolvedLanguage || nextAppState.settings?.resolvedLanguage || "zh-CN",
    characterId: nextAppState.settings?.characterId || character.id,
    expressionMode: nextAppState.settings?.expressionMode === "clickOnly" ? "clickOnly" : "automatic",
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
  activeLanguage = settings.resolvedLanguage;
  document.documentElement.lang = activeLanguage;
  applyPetLayout();

  if (characterChanged || !spriteImage) {
    window.clearInterval(animationTimer);
    spriteImage = null;
    loadSprite()
      .then(() => resetAfterSettingsChange())
      .catch((error) => console.error("Unable to load character sprite", error));
    return;
  }

  if (modeChanged) resetAfterSettingsChange();
}

function resetAfterSettingsChange() {
  if (settings.expressionMode === "clickOnly") {
    window.clearTimeout(idleTimer);
    setStaticExpression("idle", 0);
  } else {
    setState("idle");
    scheduleIdleBehavior();
  }
  scheduleStartupGreeting();
}

function handleClick() {
  window.desktopPet.recordInteraction("click");
  if (settings.expressionMode === "clickOnly") {
    const [nextState, nextFrame] = nextStaticExpression();
    setStaticExpression(nextState, nextFrame);
  } else {
    const nextState = nextClickState();
    playTemporary(nextState);
  }
}

function handleDoubleClick() {
  window.clearTimeout(clickTimer);
  ignoreSingleClicksUntil = performance.now() + 360;
  if (settings.expressionMode === "clickOnly") return;
  window.desktopPet.recordInteraction("doubleClick");
  playTemporary("jumping", 1200);
}

function handleLongPress() {
  window.clearTimeout(clickTimer);
  window.desktopPet.recordInteraction("longPress");
  if (settings.expressionMode === "clickOnly") {
    setStaticExpression("review", 1);
  } else {
    playTemporary("review", 1400);
  }
}

function scheduleSingleClick() {
  window.clearTimeout(clickTimer);
  const scheduledAt = performance.now();
  clickTimer = window.setTimeout(() => {
    if (scheduledAt < ignoreSingleClicksUntil) return;
    handleClick();
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
  dragStart = {
    x: event.screenX,
    y: event.screenY,
    time: performance.now(),
  };
  didDrag = false;
  canvas.classList.add("dragging");
  window.desktopPet.dragStart();
  window.clearInterval(dragInterval);
  dragInterval = window.setInterval(async () => {
    if (!dragStart) return;
    const movement = await window.desktopPet.dragMove();
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
  dragStart = null;

  if (didDrag) {
    didDrag = false;
    if (settings.expressionMode === "clickOnly") {
      setStaticExpression("idle", 0);
    } else {
      setState("idle");
      scheduleIdleBehavior();
    }
    return;
  }

  if (heldDuration > 450) {
    handleLongPress();
    return;
  }
  if (settings.expressionMode === "clickOnly") {
    if (event.detail > 1) return;
    handleClickOnlyPointerClick();
    return;
  }
  if (event.detail > 1) return;
  scheduleSingleClick();
}

function showBubble(text, duration = 2600) {
  if (!speechBubble || !text) return;
  window.clearTimeout(bubbleTimer);
  speechBubble.textContent = text;
  speechBubble.classList.add("visible");
  bubbleTimer = window.setTimeout(() => {
    speechBubble.classList.remove("visible");
  }, duration);
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

async function speakText(text) {
  if (!settings.tts?.enabled || !text) return;
  if (settings.tts.provider && !["none", "system"].includes(settings.tts.provider)) {
    const result = await window.desktopPet.synthesizeSpeech(text);
    if (!result?.ok || !result.audioDataUrl) return;
    const audio = new Audio(result.audioDataUrl);
    audio.play().catch(() => {});
    return;
  }
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 500));
  const voice = chooseTtsVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = Math.min(Math.max(Number(settings.tts.rate) || 1, 0.5), 1.8);
  utterance.pitch = Math.min(Math.max(Number(settings.tts.pitch) || 1, 0.5), 1.8);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function handlePetMessage(message = {}) {
  const text = typeof message === "string" ? message : message.text;
  const bubbleText = typeof message === "object" && message.bubbleText ? message.bubbleText : text;
  const action = typeof message === "object" ? message.action : "";
  showBubble(bubbleText);
  if (typeof message !== "object" || message.speak !== false) {
    speakText(text);
  }
  if (!dragStart && action && character.states[action]) {
    playTemporary(action, Math.max(temporaryDuration(action), 1200));
  }
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
    showBubble(startupGreetingText(), 2800);
    if (!dragStart && character.states.waving) {
      playTemporary("waving", 1200);
    }
  }, 650);
}

function loadSprite() {
  return new Promise((resolve, reject) => {
    const nextImage = new Image();
    nextImage.addEventListener("load", () => {
      spriteImage = nextImage;
      resolve();
    }, { once: true });
    nextImage.addEventListener("error", reject, { once: true });
    nextImage.src = character.spritePath;
  });
}

canvas.addEventListener("pointerdown", beginDrag);
canvas.addEventListener("dblclick", handleDoubleClick);
canvas.addEventListener("pointerenter", () => {
  if (settings.expressionMode !== "automatic" || dragStart || performance.now() < hoverReadyAt) return;
  hoverReadyAt = performance.now() + 10000;
  if (state === "idle") playTemporary("waving", 900);
});
window.addEventListener("pointerup", endDrag);
window.addEventListener("blur", () => {
  if (!dragStart) return;
  dragStart = null;
  window.clearInterval(dragInterval);
  window.desktopPet.dragEnd();
  canvas.classList.remove("dragging");
  setState("idle");
});

window.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  window.desktopPet.showContextMenu();
});

window.desktopPet.onAppStateUpdated(applyAppState);
window.desktopPet.onPetMessage(handlePetMessage);

window.desktopPet.getAppState()
  .then((initialAppState) => {
    applyAppState(initialAppState);
  })
  .catch((error) => {
    console.error("Unable to start Desktop Pet", error);
  });
