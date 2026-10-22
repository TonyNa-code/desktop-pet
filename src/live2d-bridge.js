(() => {
  const ORIGIN = "pet-live2d://viewer";
  const CHANNEL = "desktop-pet-model";
  const stage = document.querySelector("#model-stage");
  const status = document.querySelector("#model-status");
  let frame;
  let current;
  let ready = false;
  let loaded = false;
  let desiredExpression = -1;
  let presence = "idle";
  let audioTicket = 0;
  let ticket = 0;
  let language = "en";
  let audioContext;
  let audioSource;
  let analyser;
  let audioTimer;
  let loadTimer;

  function send(type, extra = {}) {
    if (frame && ready && current) frame.contentWindow.postMessage({ channel: CHANNEL, type, id: current.id, ...extra }, ORIGIN);
  }
  function message(key) {
    status.textContent = window.DesktopPetI18n.t(key, {}, language);
    status.hidden = !key;
  }
  function stopMouth() {
    audioTicket++;
    clearInterval(audioTimer);
    audioSource?.disconnect();
    analyser?.disconnect();
    audioSource = analyser = null;
    send("mouth", { value: 0 });
  }
  async function attachAudio(audio) {
    stopMouth();
    const token = audioTicket;
    if (!current) return;
    try {
      audioContext ||= new AudioContext();
      await audioContext.resume();
      if (token !== audioTicket || !current || audio.paused) return;
      audioSource = audioContext.createMediaElementSource(audio);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      audioSource.connect(analyser);
      analyser.connect(audioContext.destination);
      const samples = new Float32Array(analyser.fftSize);
      audioTimer = setInterval(() => {
        if (!analyser) return;
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        send("mouth", { value: audio.paused || audio.ended ? 0 : Math.min(1, Math.max(0, (rms - 0.008) * 7)) });
      }, 40);
    } catch { if (token === audioTicket) stopMouth(); }
  }
  async function apply(character, settings, busy = false) {
    const next = character.type === "live2d" ? {
      id: character.id, automatic: settings.expressionMode === "automatic",
      gaze: settings.persona?.live2dGaze !== false, busy,
    } : null;
    language = settings.resolvedLanguage;
    if (next && current?.id === next.id && frame) {
      current = next;
      send("options", next);
      return;
    }
    const token = ++ticket;
    stopMouth();
    clearTimeout(loadTimer);
    frame?.remove(); frame = null; ready = loaded = false;
    desiredExpression = -1;
    current = next;
    stage.hidden = !next;
    status.hidden = !next;
    if (!next) return;
    message("live2d.loading");
    try {
      const runtime = await window.desktopPet.getLive2DRuntime();
      if (ticket !== token) return;
      if (!runtime.ready) { message("live2d.runtimeMissing"); return; }
      frame = document.createElement("iframe");
      frame.title = "Live2D";
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
      frame.src = `${ORIGIN}/index.html`;
      stage.replaceChildren(frame);
      loadTimer = setTimeout(() => message("live2d.loadFailed"), 30000);
    } catch { if (ticket === token) message("live2d.loadFailed"); }
  }
  window.addEventListener("message", (event) => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== ORIGIN || event.data?.channel !== CHANNEL) return;
    if (event.data.type === "boot") { ready = true; send("load", current); }
    if (event.data.type === "loaded") {
      loaded = true; clearTimeout(loadTimer); status.hidden = true;
      send("options", current);
      send("expression", { index: desiredExpression });
      send("presence", { state: presence });
    }
    if (event.data.type === "error") { clearTimeout(loadTimer); message("live2d.loadFailed"); }
  });
  window.desktopPet.onModelAction((action) => {
    if (current?.id === action.id) {
      if (action.type === "expression") desiredExpression = action.index;
      if (loaded) send(action.type, { index: action.index, group: action.group });
    }
  });
  status.addEventListener("click", () => window.desktopPet.openCompanionSettings());
  window.DesktopPetModel = {
    apply, attachAudio, stopMouth,
    cycle: () => { if (loaded) send("cycle"); },
    expression: (index) => { desiredExpression = index; if (loaded) send("expression", { index }); },
    touch: () => { if (loaded) send("touch"); },
    presence: (state) => { presence = state; if (loaded) send("presence", { state }); },
    gaze: (x, y) => send("gaze", { x, y }),
    busy: (busy) => { if (current) { current.busy = busy; send("options", current); } },
  };
})();
