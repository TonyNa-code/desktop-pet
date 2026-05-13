const form = document.querySelector("#quick-form");
const input = document.querySelector("#quick-input");
const sendButton = document.querySelector("#send");
const closeButton = document.querySelector("#close");
const statusEl = document.querySelector("#status");

let sending = false;

function setStatus(text) {
  statusEl.textContent = text;
}

async function sendQuickMessage() {
  if (sending) return;
  const text = input.value.trim();
  if (!text) return;
  sending = true;
  sendButton.disabled = true;
  input.value = "";
  setStatus("等待回复...");
  try {
    const result = await window.desktopPet.sendChatMessage(text);
    setStatus(result.ok ? "已回复到桌宠气泡。" : "回复失败，检查设置。");
  } catch {
    setStatus("发送失败。");
  } finally {
    sending = false;
    sendButton.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendQuickMessage();
});

closeButton.addEventListener("click", () => window.close());

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.close();
});

input.focus();
