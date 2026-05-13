const canvas = document.querySelector("#pet");
const ctx = canvas.getContext("2d", { alpha: true });

const SPRITE = "../assets/sprites/default-character-sprite.png";
const FRAME = { width: 768, height: 832 };
const STATES = {
  idle: { row: 0, frames: 6, interval: 900 },
  runningRight: { row: 1, frames: 8, interval: 100 },
  runningLeft: { row: 2, frames: 8, interval: 100 },
  waving: { row: 3, frames: 4, interval: 160 },
  jumping: { row: 4, frames: 5, interval: 140 },
  failed: { row: 5, frames: 8, interval: 220 },
  running: { row: 6, frames: 6, interval: 100 },
  review: { row: 7, frames: 6, interval: 500 },
};

let settings = { expressionMode: "automatic", scale: 1, alwaysOnTop: true };
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

function draw() {
  if (!spriteImage) return;
  const current = STATES[state] || STATES.idle;
  const sx = (frameIndex % current.frames) * FRAME.width;
  const sy = current.row * FRAME.height;
  ctx.clearRect(0, 0, FRAME.width, FRAME.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(spriteImage, sx, sy, FRAME.width, FRAME.height, 0, 0, FRAME.width, FRAME.height);
}

function startAnimation() {
  window.clearInterval(animationTimer);
  const current = STATES[state] || STATES.idle;
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
  if (!STATES[nextState]) return;
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
      const choices = ["review", "review", "waving", "jumping"];
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
  const states = ["waving", "review", "jumping", "failed"];
  const nextState = states[clickExpressionIndex % states.length];
  clickExpressionIndex += 1;
  return nextState;
}

function nextStaticExpression() {
  const expressions = [
    ["idle", 0],
    ["idle", 1],
    ["idle", 2],
    ["idle", 3],
    ["idle", 5],
    ["waving", 2],
    ["review", 1],
    ["review", 4],
    ["failed", 1],
    ["failed", 4],
  ];
  const expression = expressions[clickExpressionIndex % expressions.length];
  clickExpressionIndex += 1;
  return expression;
}

function setStaticExpression(nextState, nextFrame) {
  window.clearTimeout(idleTimer);
  temporaryToken += 1;
  state = nextState;
  frameIndex = Math.min(Math.max(0, nextFrame), STATES[nextState].frames - 1);
  startAnimation();
  draw();
}

function applySettings(nextSettings) {
  settings = {
    expressionMode: nextSettings.expressionMode === "clickOnly" ? "clickOnly" : "automatic",
    scale: Number(nextSettings.scale) || 1,
    alwaysOnTop: nextSettings.alwaysOnTop !== false,
  };
  if (settings.expressionMode === "clickOnly") {
    window.clearTimeout(idleTimer);
    setStaticExpression("idle", 0);
  } else {
    setState("idle");
    scheduleIdleBehavior();
  }
}

function handleClick() {
  if (settings.expressionMode === "clickOnly") {
    const [nextState, nextFrame] = nextStaticExpression();
    setStaticExpression(nextState, nextFrame);
  } else {
    const nextState = nextClickState();
    playTemporary(nextState);
  }
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

  if (event.detail > 1 || heldDuration > 450 || clickedRecently) return;
  lastClickAt = performance.now();
  handleClick();
}

function loadSprite() {
  return new Promise((resolve, reject) => {
    spriteImage = new Image();
    spriteImage.addEventListener("load", resolve, { once: true });
    spriteImage.addEventListener("error", reject, { once: true });
    spriteImage.src = SPRITE;
  });
}

canvas.addEventListener("pointerdown", beginDrag);
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

window.desktopPet.onSettingsUpdated(applySettings);

Promise.all([loadSprite(), window.desktopPet.getSettings()])
  .then(([, initialSettings]) => {
    applySettings(initialSettings);
    startAnimation();
  })
  .catch((error) => {
    console.error("Unable to start Desktop Pet", error);
  });
