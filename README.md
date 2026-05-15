# Desktop Pet

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

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
| Windows | `Desktop-Pet-*-win-x64.exe` | Installer for 64-bit Windows. |
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

- `Base URL`: a `/chat/completions` compatible endpoint, such as `http://localhost:11434/v1` for a local model service or a compatible cloud API URL
- `Model Name`: the model name supported by the service; local and cloud services both need it
- `API key`: only needed when the service requires authentication; local services usually leave it empty

`Test Chat Connection` sends a real request using the current form values and shows a short model response on success.

API keys are stored only on this device. The app uses system secure storage when available; if secure persistence is not available, keys are kept only for the current run. Chat history is kept only in memory and is not written to the repository.

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

## License

Code is released under the MIT License. See [ASSET_NOTICE.md](ASSET_NOTICE.md) before publicly redistributing artwork assets.
