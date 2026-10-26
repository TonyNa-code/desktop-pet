# Desktop Pet

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

**0.5.0 companion update:** import a Live2D character, talk beside the pet, and customize touch reactions and reply gestures. Existing sprite characters, settings and window recovery remain available. [Release notes](docs/releases/v0.5.0.md).

**Live2D is optional.** Bring your own compatible exported model and install the supported Core file locally. Neither Core nor sample models are bundled. [Model import, compatibility and licensing](docs/live2d.md).

[![Build](https://github.com/TonyNa-code/desktop-pet/actions/workflows/build.yml/badge.svg)](https://github.com/TonyNa-code/desktop-pet/actions/workflows/build.yml)
[![Latest Release](https://img.shields.io/github/v/release/TonyNa-code/desktop-pet?label=latest%20release)](https://github.com/TonyNa-code/desktop-pet/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)

A cross-platform anime desktop pet for Windows, macOS, and Linux, with sprite character packs, optional Live2D models, multilingual UI, chat model integration, and optional voice replies. It uses Electron for a transparent always-on-top pet window. Sprite packs use a spritesheet and a small `character.json` action manifest; Live2D imports use `.model3.json` and its associated files.

<p align="center">
  <img src="docs/desktop-pet-demo.gif" alt="Desktop Pet animated preview" width="256" />
</p>

## Quick Download

Open the [latest release](https://github.com/TonyNa-code/desktop-pet/releases/latest), then download the file for your system:

| System | Download | Notes |
| --- | --- | --- |
| Windows installer | `Desktop-Pet-*-win-x64-setup.exe` | Installer for 64-bit Windows. |
| Windows portable | `Desktop-Pet-*-win-x64-portable.exe` | Portable build for 64-bit Windows. |
| macOS Apple Silicon | `Desktop-Pet-*-mac-arm64.dmg` | Recommended for M1/M2/M3/M4 Macs. |
| macOS Apple Silicon, zipped app | `Desktop-Pet-*-mac-arm64.zip` | Use this if you prefer a zip package. |
| Linux | `Desktop-Pet-*-linux-x86_64.AppImage` | Portable AppImage package. |
| Linux archive | `Desktop-Pet-*-linux-x64.tar.gz` | Use this if AppImage is not suitable. |

On macOS, if the system says the app cannot be verified, right-click the app and choose `Open`, then confirm once. This is common for unsigned open-source test builds.

## Why Desktop Pet?

- Built for small animated desktop companions, not a full chat client
- Character packs are simple folders with `sprite.png`, `preview.png`, and `character.json`
- Supports English, Simplified Chinese, Japanese, or following the system language
- Optional chat and voice features can be left off for a lightweight pet experience

## Built-In Characters

| Default Character | Luna |
| --- | --- |
| ![Default character preview](assets/characters/default/preview.png) | ![Luna character preview](assets/characters/luna/preview.png) |
| Dynamic sample pack with idle, movement, waving, jumping, failed, and thinking actions. | Mostly static expression pack with tsundere, shy, surprised, happy, and thinking states. |

## Beginner Guides

If you only want to download and run the app, see [快速上手指南.md](快速上手指南.md). If you want to replace or create a character, see [角色更换与制作指南.md](角色更换与制作指南.md).

## Features

- Transparent, frameless, always-on-top pet window
- Optional Live2D import with blinking, breathing, touch reactions and configurable reply gestures
- Interface language: follow system, Simplified Chinese, English, Japanese
- Drag to move, with movement animation while dragging
- Click, double-click, long press, and mouse hover reactions
- Right-click menu for:
  - Character packs
  - Automatic expression mode
  - Click-to-change expression mode
  - 75% to 200% size
  - Always on top
  - Reset to bottom right
  - Interface language
- Tools:
  - Current time
  - 25-minute focus reminder
  - 30 / 60-minute break reminder
- Chat:
  - Input beside the character, with replies above it and a visible menu for settings or quitting
  - Minimal quick input window with replies shown in the pet bubble
  - Small floating chat window
  - Separate chat settings window
  - Visual character picker in settings
  - Compatible `/chat/completions` style chat services
  - Custom persona, speaking style, and optional affection stages
  - Automatic pet expression changes based on replies
  - Reply voice via system voice, local GPT-SoVITS inference service, or custom voice API
- Settings are saved locally
- GitHub Actions builds Windows / macOS / Linux packages and updates the latest release

## Position And Recovery

Drag the pet where you want it; it returns there after restarting. When a display is removed or its work area changes, the pet moves into an available screen, with Quick Input following it. The pet temporarily fits smaller screens without changing your selected size.

Use the Desktop Pet icon in the macOS menu bar or Windows/Linux system tray to choose **Show Pet**, reset its position, open chat or settings, or quit. Opening the app again brings back the running pet without starting another copy. Linux tray support and window placement depend on the desktop environment; Wayland may restrict programmatic positioning.

Position is stored only on this device, separately from conversation data. It is not sent to chat or voice services, and does not include display names or hardware identifiers.

## Run From Source

```bash
npm install
npm start
```

## Validate

```bash
npm run check
```

This checks chat and settings behavior, JavaScript syntax, character-pack dimensions, and common privacy leaks such as local paths or committed secrets.

```bash
npm run test:smoke
```

This opens the app with temporary settings and local test services, exercises the main windows, and verifies settings after a restart. It does not use personal settings or contact a model provider. Release builds run this check on all three operating systems before publication.

```bash
npm run privacy:check
```

## Build

```bash
npm run build
```

Local builds are reliable for the current operating system. GitHub Actions builds packages separately on Windows, macOS, and Linux runners.

## Chat, Persona, And Voice

Change language from `right-click menu > Language` or `Chat Settings > General > Interface Language`. It affects menus, windows, bubbles, and the default chat language.

Right-click the pet and choose `Chat > Quick Input` for a minimal companion-style input box. Replies appear directly in the pet bubble. Choose `Chat > Full Chat` for a floating chat window with history, or `Chat > Chat Settings` to configure the companion.

Switch between Quick Input and Full Chat using their header buttons. Unsent text is shared between both windows, survives closing and reopening them, and stays separate for each character. Drafts are kept only for the current app session: quitting clears them even when saved history is enabled. Only sending a message submits that text to the model service. Quick Input supports Enter to send, Shift+Enter for a new line, and an explicit Retry after a failed or stopped reply. Reading older messages or selecting text is not interrupted by incoming reply tokens; use Latest reply to return to the bottom.

The settings window opens automatically on first launch. `Persona` controls the character name, personality, speaking style, background, and extra rules. If left empty, the app uses the current character pack's default style.

Set `Your preferred name` and `Your relationship` in the Character tab to personalize how each character addresses you. Choose friends, romantic partners, a custom relationship, or keep the existing persona. These settings do not require enabling affection. Names and relationship details are stored locally with the character; when chatting, they are included in the persona sent to your configured model service. Reply style depends on the chosen model.

`Affection` is off by default. When enabled, it only grows slowly with active chat time. Clicks, double-clicks, long presses, expression changes, and app launches do not increase it.

Chat model fields:

- Service presets: DeepSeek, OpenAI, Google Gemini, Qwen (Beijing), SiliconFlow, OpenRouter, Groq, Ollama, LM Studio, and Custom API. Each cloud service needs its own API key; a DeepSeek key cannot authenticate to another provider.
- DeepSeek preset: uses `https://api.deepseek.com` and `deepseek-flash`; see the [DeepSeek API documentation](https://api-docs.deepseek.com/) for other model names.
- `Base URL`: a `/chat/completions` compatible endpoint, such as `http://localhost:11434/v1` for a local model service or a compatible cloud API URL
- `Model Name`: the model name supported by the service; local and cloud services both need it
- `API key`: only needed when the service requires authentication; local services usually leave it empty

`Test Chat Connection` sends a real request using the current form values and shows a short model response on success.

`Get models` retrieves a service's model list without sending a conversation. Choose a text chat model, or enter its exact name manually if the service does not offer a list. Turn off `Send temperature parameter` for models that reject that parameter. Compatibility means OpenAI **Chat Completions**, not native Anthropic Messages, Gemini GenerateContent, or OpenAI Responses. Claude models can be accessed through a compatible provider such as OpenRouter; this does not accept an Anthropic key directly.

Provider references: [OpenAI](https://developers.openai.com/api/reference/chat-completions/overview), [Gemini compatibility](https://ai.google.dev/gemini-api/docs/openai), [Qwen regional endpoints](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope), [SiliconFlow](https://docs.siliconflow.cn/docs/userguide/quickstart), [OpenRouter](https://openrouter.ai/docs/quickstart), [Groq](https://console.groq.com/docs/openai). Availability, billing, and model access depend on the chosen provider. Adding a preset does not mean every model has been tested.

API keys are stored only on this device. The app uses system secure storage when available; if secure persistence is not available, keys are kept only for the current run. Chat history stays in memory by default. Each character can optionally keep its latest 80 messages on this device; turning that option off deletes its saved history. History is not written to the repository.

### Companion Features

Available in 0.4.0:

- The pet's Talk button opens an input box beside the character. It follows the pet as it moves, shows the character's name, and links to history and settings. Replies remain in the pet bubble, including the full text of longer responses.
- Replies can select an expression from the current character pack. Missing or unrecognized expressions stay neutral rather than guessing from emotional keywords. Click-only expression mode remains manual.
- Conversation gestures play once and hold while the reply is visible, with no idle or hover interruption. Bubbles stay visible during voice generation and playback. Voice errors leave the text reply intact.
- Voice controls appear beside the pet, in Quick Input and in Full Chat. Stop during synthesis or playback without losing the written reply. Replay the latest successful reply for the current character without requesting another model answer or changing affection.
- Break and focus reminders wait until the current reply is dismissed. Only the latest queued notice is kept, and notices older than a minute are discarded.
- Standard editing shortcuts and input-field context menus support pasting API keys and messages.
- Settings are grouped into General, Character, Memories, Chat and Voice, with a fixed save bar and unsaved-change confirmation.
- Replies can stream as they arrive. Stop or retry a reply in Full Chat; Quick Input also supports stopping. Disable `Stream replies` for a service that only supports non-streaming requests.
- Long replies keep their paragraphs and support scrolling and text selection. Bubbles pause while hovered or keyboard-focused. Their toolbar opens Quick Input or Full Chat, pins the current reply, or dismisses it.
- Show last reply beside Talk restores this character's latest completed reply, pinned for reading. It does not contact a model or voice service or change affection. Dismissing a reply stops its voice; any unfinished generation continues into chat history without reopening the bubble. To stop generation, use Stop in either chat window. History saving remains optional and off by default.
- Each character has its own persona, affinity and conversation. Model and voice service settings are shared. Existing settings migrate to the currently selected character.
- Import a character folder or ZIP from the Character tab, review its preview, then add it. Packs are stored separately from the installed app. Removing an imported character deletes its local profile and saved history, not the original source files.
- Custom TTS supports JSON POST and Query GET. GET templates must contain only scalar values. Voice tests report playback failures, not just HTTP success. Raw PCM is not supported; use WAV, MP3, OGG or AAC supported by the service and audio decoder.

Voice is off by default. Supported voice backends:

- System voice: use the operating system's built-in voices.
- Local GPT-SoVITS service: start the GPT-SoVITS inference service locally, then enter a URL such as `http://127.0.0.1:9880/tts`. The app calls that local HTTP service; it does not train models for you.
- Custom voice API: for cloud voice services or your own wrapper. The app sends a JSON template where `{{text}}` is replaced with the text to speak.

`Test Voice` sends a real request with the current voice configuration. GPT-SoVITS and custom APIs should return an audio stream, or JSON containing an audio URL, base64 audio, or a data URL.

Long replies are read in segments, without the former 500 / 800 character cutoff. Sending a new message, changing characters, clearing chat or changing voice settings stops the current voice and cancels pending voice requests. Replay uses your current voice service. External services receive a request per segment and may charge for it; stopping cannot recall text already sent or guarantee a refund. Voice stays off by default, with no microphone input or recording.

### Shared Memories And Touch

In **Settings > Memories**, write the details you want the current character to refer to, one per line. The list holds up to 20 notes of 240 characters each. Enable **Use these memories in conversations** and save. This is off by default; the app does not extract memories from chats or make extra model requests to build the list.

You can edit or remove any line, or clear the list, then save. Each character has a separate list, independent of saved chat history. Turning memories off stops attaching the list to new model requests but keeps the notes on this device. Deleting notes does not remove references already present in chat history or data already sent to a provider. Clear chat history separately when needed. Notes are stored as local text, not in a password vault; enabled notes are sent to your configured model with each conversation request. Recall depends on the model and is not guaranteed.

In automatic expression mode, a head touch or long press, a body tap, and putting the character down after dragging give different local responses using the pack's existing expressions. Built-in characters have distinct short lines, with your preferred name when set. These interactions do not contact a model, play TTS, or increase affection. Short lines do not replace visible replies or reminders, and touches do not interrupt a conversation or voice playback. Turn off **General > Touch responses** for the previous gesture-only behavior.

Click-to-change mode stays manual: one click advances one expression, double-clicks and long presses do not add changes, and dragging restores the expression you selected before the move. Existing sprite artwork is unchanged. For imported models, see the [Live2D guide](docs/live2d.md).

## Character Packs

Built-in packs:

- `default`: dynamic sample pack with 8 action rows.
- `luna`: mostly static expression pack with multiple expression states.

Character packs live under:

```text
assets/characters/
  default/
    character.json
    preview.png
    sprite.png
  luna/
    character.json
    preview.png
    sprite.png
```

Pack files:

- `character.json`: character name, action rows, frame counts, and playback speed
- `sprite.png`: spritesheet, 8 columns by default, 768 x 832 per frame
- `preview.png`: preview image

Base action row order:

1. idle
2. runningRight
3. runningLeft
4. waving
5. jumping
6. failed
7. running
8. review

To add a character, create a new folder under `assets/characters/` with the same three files. A pack can be a fully dynamic action sheet or a mostly static expression pack. Available characters appear in the right-click menu.

## Local State

The app stores simple local state such as window settings, character settings, persona, chat configuration, affection value, and active chat time.

These files stay in the app data directory on this device and are not uploaded to the repository or network.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, pull request checks, and character-pack contribution notes.

## License

Code is released under the MIT License. See [ASSET_NOTICE.md](ASSET_NOTICE.md) before publicly redistributing artwork assets.

Bundled Chinese and Japanese fallback fonts use the SIL Open Font License 1.1. See the [font notices](assets/fonts/NOTICE.md).
