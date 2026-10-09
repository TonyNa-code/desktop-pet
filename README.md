# Desktop Pet

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

**0.1.1 maintenance update:** fixes chat sending, settings drafts, and API key handling when changing services, and updates packaging dependencies. Updating from 0.1.0 is recommended. [Release notes](docs/releases/v0.1.1.md).

[![Build](https://github.com/TonyNa-code/desktop-pet/actions/workflows/build.yml/badge.svg)](https://github.com/TonyNa-code/desktop-pet/actions/workflows/build.yml)
[![Latest Release](https://img.shields.io/github/v/release/TonyNa-code/desktop-pet?label=latest%20release)](https://github.com/TonyNa-code/desktop-pet/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)

A cross-platform anime desktop pet for Windows, macOS, and Linux, with character packs, multilingual UI, chat model integration, and optional voice replies. It uses Electron for a transparent always-on-top pet window, and loads each character from a spritesheet plus a small `character.json` action manifest.

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

The settings window opens automatically on first launch. `Persona` controls the character name, personality, speaking style, background, and extra rules. If left empty, the app uses the current character pack's default style.

`Affection` is off by default. When enabled, it only grows slowly with active chat time. Clicks, double-clicks, long presses, expression changes, and app launches do not increase it.

Chat model fields:

- Current-source presets: DeepSeek, OpenAI, Google Gemini, Qwen (Beijing), SiliconFlow, OpenRouter, Groq, Ollama, LM Studio, and Custom API. Each cloud service needs its own API key; a DeepSeek key cannot authenticate to another provider.
- DeepSeek preset: uses `https://api.deepseek.com` and `deepseek-flash`; see the [DeepSeek API documentation](https://api-docs.deepseek.com/) for other model names.
- `Base URL`: a `/chat/completions` compatible endpoint, such as `http://localhost:11434/v1` for a local model service or a compatible cloud API URL
- `Model Name`: the model name supported by the service; local and cloud services both need it
- `API key`: only needed when the service requires authentication; local services usually leave it empty

`Test Chat Connection` sends a real request using the current form values and shows a short model response on success.

In the current source, `Get models` retrieves a service's model list without sending a conversation. Choose a text chat model, or enter its exact name manually if the service does not offer a list. Turn off `Send temperature parameter` for models that reject that parameter. Compatibility means OpenAI **Chat Completions**, not native Anthropic Messages, Gemini GenerateContent, or OpenAI Responses. Claude models can be accessed through a compatible provider such as OpenRouter; this does not accept an Anthropic key directly.

Provider references: [OpenAI](https://developers.openai.com/api/reference/chat-completions/overview), [Gemini compatibility](https://ai.google.dev/gemini-api/docs/openai), [Qwen regional endpoints](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope), [SiliconFlow](https://docs.siliconflow.cn/docs/userguide/quickstart), [OpenRouter](https://openrouter.ai/docs/quickstart), [Groq](https://console.groq.com/docs/openai). Availability, billing, and model access depend on the chosen provider. Adding a preset does not mean every model has been tested.

API keys are stored only on this device. The app uses system secure storage when available; if secure persistence is not available, keys are kept only for the current run. Chat history stays in memory by default. Each character can optionally keep its latest 80 messages on this device; turning that option off deletes its saved history. History is not written to the repository.

### Upcoming Source Features

These features are available in the current source, not the 0.1.1 downloads:

- The pet's Talk button opens an input box beside the character. It follows the pet as it moves, shows the character's name, and links to history and settings. Replies remain in the pet bubble, including the full text of longer responses.
- Replies can select an expression from the current character pack. Unrecognized expressions fall back to the existing reply reactions. Click-only expression mode remains manual.
- Standard editing shortcuts and input-field context menus support pasting API keys and messages.
- Settings are grouped into General, Character, Chat and Voice, with a fixed save bar and unsaved-change confirmation.
- Replies can stream as they arrive. Stop or retry a reply in Full Chat; Quick Input also supports stopping. Disable `Stream replies` for a service that only supports non-streaming requests.
- Long replies keep their paragraphs. Pet bubbles stay longer for longer text, pause on hover, and open Full Chat when clicked.
- Each character has its own persona, affinity and conversation. Model and voice service settings are shared. Existing settings migrate to the currently selected character.
- Import a character folder or ZIP from the Character tab, review its preview, then add it. Packs are stored separately from the installed app. Removing an imported character deletes its local profile and saved history, not the original source files.
- Custom TTS supports JSON POST and Query GET. GET templates must contain only scalar values. Voice tests report playback failures, not just HTTP success. Raw PCM is not supported; use WAV, MP3, OGG or AAC supported by the service and audio decoder.

Voice is off by default. Supported voice backends:

- System voice: use the operating system's built-in voices.
- Local GPT-SoVITS service: start the GPT-SoVITS inference service locally, then enter a URL such as `http://127.0.0.1:9880/tts`. The app calls that local HTTP service; it does not train models for you.
- Custom voice API: for cloud voice services or your own wrapper. The app sends a JSON template where `{{text}}` is replaced with the text to speak.

`Test Voice` sends a real request with the current voice configuration. GPT-SoVITS and custom APIs should return an audio stream, or JSON containing an audio URL, base64 audio, or a data URL.

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
