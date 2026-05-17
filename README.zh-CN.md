# Desktop Pet

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

[![Build](https://github.com/TonyNa-code/desktop-pet/actions/workflows/build.yml/badge.svg)](https://github.com/TonyNa-code/desktop-pet/actions/workflows/build.yml)
[![Latest Release](https://img.shields.io/github/v/release/TonyNa-code/desktop-pet?label=latest%20release)](https://github.com/TonyNa-code/desktop-pet/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)

一个可以在 Windows / macOS / Linux 上运行的二次元桌宠项目，支持角色包、多语言界面、聊天模型接入和可选语音朗读。它使用 Electron 做透明置顶窗口，每个角色由 spritesheet、预览图和 `character.json` 动作配置加载。

<p align="center">
  <img src="docs/desktop-pet-demo.gif" alt="Desktop Pet animated preview" width="256" />
</p>

## 快速下载

打开 [latest release](https://github.com/TonyNa-code/desktop-pet/releases/latest)，按系统下载对应文件：

| 系统 | 下载文件 | 说明 |
| --- | --- | --- |
| Windows 安装版 | `Desktop-Pet-*-win-x64-setup.exe` | 适合 64 位 Windows。 |
| Windows 便携版 | `Desktop-Pet-*-win-x64-portable.exe` | 不想安装时使用。 |
| macOS Apple Silicon | `Desktop-Pet-*-mac-arm64.dmg` | 推荐给 M1/M2/M3/M4 Mac。 |
| macOS 压缩包 | `Desktop-Pet-*-mac-arm64.zip` | 偏好 zip 包时使用。 |
| Linux | `Desktop-Pet-*-linux-x86_64.AppImage` | 便携 AppImage 包。 |
| Linux 压缩包 | `Desktop-Pet-*-linux-x64.tar.gz` | AppImage 不适用时使用。 |

macOS 如果提示无法验证开发者，右键 app 选择 `打开`，再确认一次即可。开源测试版没有商业签名时比较常见。

## 为什么是 Desktop Pet？

- 它首先是一个小型桌面陪伴工具，不是臃肿聊天客户端。
- 角色包只是 `sprite.png`、`preview.png` 和 `character.json`，结构清楚。
- 支持跟随系统、简体中文、English、日本語。
- 聊天和语音都可以关闭，只保留轻量桌宠体验。

## 内置角色

| Default Character | Luna |
| --- | --- |
| ![Default character preview](assets/characters/default/preview.png) | ![Luna character preview](assets/characters/luna/preview.png) |
| 动态动作样例，包含待机、移动、挥手、跳起、失败和思考动作。 | 偏静态表情动作包，包含傲娇、害羞、惊讶、开心、思考等表情状态。 |

## 使用指南

如果只是想下载后直接运行，请看 [快速上手指南.md](快速上手指南.md)。如果想换角色或制作新角色，请看 [角色更换与制作指南.md](角色更换与制作指南.md)。

## 功能

- 透明、无边框、置顶小窗口
- 界面语言支持跟随系统、简体中文、English、日本語
- 鼠标拖拽移动，拖动时自动播放移动动画
- 左键点击、双击、长按、鼠标靠近都会触发不同反应
- 右键菜单切换：
  - 角色包
  - 自动表情
  - 点击表情
  - 75% 到 200% 大小
  - 总在最前
  - 回到屏幕右下角
  - 界面语言
- 实用功能：
  - 当前时间
  - 25 分钟专注提醒
  - 30 / 60 分钟休息提醒
- 对话功能：
  - 极简快速输入窗，回复直接显示到桌宠气泡
  - 右键打开小型悬浮聊天窗口
  - 单独的对话设置窗口
  - 设置窗口内可视化切换角色
  - 连接兼容常见聊天接口格式的服务
  - 自定义人物设定、说话方式和可选好感度阶段
  - 根据回复内容自动切换桌宠表情
  - 使用系统语音、本地 GPT-SoVITS 推理服务或自定义语音接口朗读回复
- 设置会自动保存到本机
- GitHub Actions 可在 Windows / macOS / Linux 上构建安装包并更新 Release

## 源码运行

```bash
npm install
npm start
```

## 校验

```bash
npm run check
```

这会检查 JavaScript 语法、角色素材尺寸，以及常见隐私泄漏，例如本机路径或误提交的密钥。

```bash
npm run privacy:check
```

## 打包

```bash
npm run build
```

本地构建只能稳定生成当前系统对应的平台包。GitHub Actions 会分别在 Windows、macOS 和 Linux runner 上构建三端产物。

## 对话、人物设定与语音

语言可以在 `右键菜单 > 语言` 或 `对话设置 > 通用 > 界面语言` 里切换。它会影响菜单、窗口、提示气泡和默认对话语言。

右键桌宠，选择 `对话 > 快速输入` 会打开极简输入框，适合实时陪伴式对话，回复会直接出现在桌宠气泡里。选择 `对话 > 完整聊天` 会打开带聊天记录的小型悬浮聊天窗。选择 `对话 > 对话设置`，或在聊天窗里点 `设置`，会打开单独的设置窗口。

第一次打开应用时会自动弹出设置窗口。`人物设定` 会影响角色称呼、性格、说话方式、背景设定和额外规则。没有填写时，应用会使用当前角色包的默认风格。

`好感度` 默认关闭。开启后，它只会随着有效聊天时长缓慢增长。点击、双击、长按、换表情、打开应用都不会增加，也没有每日增长规则。可以设置当前数值、每多少分钟增加 1 点、连续聊天间隔、阶段阈值，以及低/中/高阶段对应的说话方式。

聊天模型区域填写：

- 预设：`Ollama`、`LM Studio`、`DeepSeek`、`自定义接口` 会填入常见 Base URL 和模型名起点。
- DeepSeek 预设：当前使用 `https://api.deepseek.com` 和 `deepseek-v4-flash` 作为低门槛起点；如果你的账号使用其它 DeepSeek 模型，可以自行改模型名。
- `Base URL`：兼容常见 `/chat/completions` 格式的接口地址，例如本地模型服务 `http://localhost:11434/v1`，或云端模型平台提供的兼容地址
- `模型名`：接口支持的模型名，本地和云端都需要填写
- `API key`：需要鉴权的接口才填写，本地模型通常可以留空

点 `测试聊天连接` 会用当前表单配置发起一次真实请求，成功后会显示模型返回的简短内容。

API key 只保存在本机。应用会优先用系统安全存储加密；如果当前系统不支持安全持久化，key 只在本次运行中保留。聊天记录只保留在本次运行中，不会写入仓库。

语音朗读默认关闭。设置窗口支持这些语音后端：

- 系统语音：直接使用系统自带声音。
- GPT-SoVITS 本地推理服务：先在本机启动 GPT-SoVITS 的推理服务，再填入类似 `http://127.0.0.1:9880/tts` 的地址。应用会请求这个本地 HTTP 服务，不会替你训练模型。
- 自定义语音接口：适合网络语音服务或自行封装的服务。应用会按 JSON 模板发送请求，模板里用 `{{text}}` 代表要朗读的文字。

点 `测试语音` 会真实请求当前语音配置。GPT-SoVITS 和自定义接口需要返回音频流，或返回包含音频 URL / base64 / data URL 的 JSON。

桌宠收到回复时会显示更大的气泡，并根据回复内容切换到适合的表情或动作。

## 角色包

内置角色包：

- `default`：动态动作样例，8 行动作表，适合参考基础动画规格。
- `luna`：偏静态表情动作包，保留多种表情状态，适合参考静态角色扩展方式。

角色包都放在：

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

角色包约定：

- `character.json`：角色名称、动作行、帧数、播放速度
- `sprite.png`：spritesheet，默认 8 列，单帧 768 x 832
- `preview.png`：预览图

基础动作行顺序：

1. idle
2. runningRight
3. runningLeft
4. waving
5. jumping
6. failed
7. running
8. review

新增角色时，在 `assets/characters/` 下增加一个新文件夹，并提供同样结构的三个文件。角色可以是完整动态动作表，也可以是以静态表情为主的动作包。应用右键菜单会显示可用角色。

更完整的角色替换步骤、动作表规格和 AI 生图提示词模板见 [角色更换与制作指南.md](角色更换与制作指南.md)。

## 本地状态

应用会在本机保存简单状态，例如窗口设置、角色设置、人物设定、聊天配置、好感度数值和有效聊天时长。

这些状态只保存在本机应用数据目录，不会上传到仓库或网络。

## 贡献

本地开发、PR 检查和角色包贡献说明见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

Code is released under the MIT License. See [ASSET_NOTICE.md](ASSET_NOTICE.md) before publicly redistributing artwork assets.
