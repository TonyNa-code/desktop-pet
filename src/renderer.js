const canvas = document.querySelector("#pet");
const ctx = canvas.getContext("2d", { alpha: true });

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

let settings = { expressionMode: "automatic", scale: 1, alwaysOnTop: true };
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
let lastClickAt = 0;
let clickTimer;
let hoverReadyAt = 0;

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

  const delay = 18000 + Math.random() * 14000;
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
    characterId: nextAppState.settings?.characterId || character.id,
    expressionMode: nextAppState.settings?.expressionMode === "clickOnly" ? "clickOnly" : "automatic",
    scale: Number(nextAppState.settings?.scale) || 1,
    alwaysOnTop: nextAppState.settings?.alwaysOnTop !== false,
  };

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
  clickTimer = window.setTimeout(() => {
    lastClickAt = performance.now();
    handleClick();
  }, 180);
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
  const clickedRecently = performance.now() - lastClickAt < 250;
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
  if (event.detail > 1 || clickedRecently) return;
  scheduleSingleClick();
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

window.desktopPet.getAppState()
  .then((initialAppState) => {
    applyAppState(initialAppState);
  })
  .catch((error) => {
    console.error("Unable to start Desktop Pet", error);
  });
