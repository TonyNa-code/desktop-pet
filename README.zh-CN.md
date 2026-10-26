# Desktop Pet

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

**0.5.0 陪伴体验更新：**导入 Live2D 角色，在人物身旁对话，自定义触碰反应与回复动作。原有图片角色、设置和窗口找回功能继续保留。[更新说明](docs/releases/v0.5.0.md)。

**Live2D 是可选功能。**需要自行导入兼容的导出模型，并在本机安装受支持的 Core 文件。安装包不附带 Core 或示例模型。[模型导入、兼容性与许可说明](docs/live2d.md#简体中文)。

[![Build](https://github.com/TonyNa-code/desktop-pet/actions/workflows/build.yml/badge.svg)](https://github.com/TonyNa-code/desktop-pet/actions/workflows/build.yml)
[![Latest Release](https://img.shields.io/github/v/release/TonyNa-code/desktop-pet?label=latest%20release)](https://github.com/TonyNa-code/desktop-pet/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)

一个可以在 Windows / macOS / Linux 上运行的二次元桌宠项目，支持图片角色包、可选 Live2D 模型、多语言界面、聊天模型接入和可选语音朗读。它使用 Electron 做透明置顶窗口；图片角色由 spritesheet、预览图和 `character.json` 动作配置加载，Live2D 角色使用 `.model3.json` 及其配套文件。

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
- 可选 Live2D 模型导入，支持眨眼、呼吸、触碰反应与自定义回复动作
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
  - 人物旁展开输入框，回复显示在人物上方；旁边的菜单可打开设置或退出
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

## 位置与找回

把桌宠拖到喜欢的位置，重启后会回到那里。拔掉显示器或调整屏幕工作区后，桌宠会移回可用屏幕，快速输入框跟随移动。屏幕放不下时，角色会临时缩小，保留原先选择的大小设置。

点击 macOS 菜单栏或 Windows/Linux 系统托盘中的 Desktop Pet 图标，可选择“找回桌宠”、重置位置、打开聊天和设置，或退出。再次打开应用也能唤回正在运行的桌宠，不会同时启动两份。Linux 托盘与窗口定位受桌面环境影响，Wayland 可能限制程序调整窗口位置。

位置与聊天数据分开保存在本机，不会发送给聊天或语音服务，也不记录显示器名称或硬件标识。

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

通过窗口顶部按钮可在快速输入与完整聊天间切换，未发送的文字会同步保留；关闭窗口再打开也能接着写，各角色的草稿互不混用。草稿只在本次运行的内存中暂存，退出应用后清除，即使开启了聊天记录保存也不会保存草稿。只有点击发送才会把文字交给模型服务。快速输入支持 Enter 发送、Shift+Enter 换行，失败或停止后可以手动重试。查看旧消息或选择文字时，新回复不会反复重建已有气泡；点“最新回复”可回到底部。

第一次打开应用时会自动弹出设置窗口。`人物设定` 会影响角色称呼、性格、说话方式、背景设定和额外规则。没有填写时，应用会使用当前角色包的默认风格。

`好感度` 默认关闭。开启后，它只会随着有效聊天时长缓慢增长。点击、双击、长按、换表情、打开应用都不会增加，也没有每日增长规则。可以设置当前数值、每多少分钟增加 1 点、连续聊天间隔、阶段阈值，以及低/中/高阶段对应的说话方式。

聊天模型区域填写：

- 预设：`Ollama`、`LM Studio`、`DeepSeek`、`自定义接口` 会填入常见 Base URL 和模型名起点。
- DeepSeek 预设：使用 `https://api.deepseek.com` 和 `deepseek-flash`；其它模型名可参考 [DeepSeek 官方文档](https://api-docs.deepseek.com/)。
- 另有 OpenAI、Google Gemini、通义千问（北京）、SiliconFlow、OpenRouter、Groq 预设，并保留 Ollama、LM Studio 和自定义接口。每个服务使用各自的密钥，DeepSeek 密钥不能用于其它平台。
- “获取模型列表”只查询模型，不发送聊天内容。请选择支持文字对话的模型；服务不提供列表时仍可手动填入。模型不接受温度参数时可关闭“发送温度参数”。
- 兼容范围为 OpenAI Chat Completions，不包含原生 Anthropic Messages、Gemini GenerateContent 或 OpenAI Responses。Claude 可通过 OpenRouter 等兼容服务接入，不能直接填入 Anthropic 密钥。千问地址必须与密钥所属地域一致，参见[官方地域说明](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope)。预设不代表所有模型都经过实测。

角色旁“对话”按钮会打开跟随角色移动的简约输入框，并显示角色称呼。完整回复显示在气泡中，可滚动阅读；记录和设置仍可单独打开。模型可从角色已有动作中选择表情，“点击换表情”模式仍然只由点击控制。

在角色页填写“她怎么称呼你”，再选择朋友、恋人或自定义关系，也可以沿用原有人设。每个角色分别保存，不需要开启好感度。称呼和关系保存在本机，聊天时会随人设发送到你配置的模型服务；实际口吻取决于所选模型。
- `Base URL`：兼容常见 `/chat/completions` 格式的接口地址，例如本地模型服务 `http://localhost:11434/v1`，或云端模型平台提供的兼容地址
- `模型名`：接口支持的模型名，本地和云端都需要填写
- `API key`：需要鉴权的接口才填写，本地模型通常可以留空

点 `测试聊天连接` 会用当前表单配置发起一次真实请求，成功后会显示模型返回的简短内容。

API key 只保存在本机。应用会优先用系统安全存储加密；如果当前系统不支持安全持久化，key 只在本次运行中保留。聊天记录默认只在本次运行中保留；每个角色可以单独开启本地保存，保留最近 80 条消息。关闭保存会删除该角色的已存记录。聊天记录不会写入仓库。

### 陪伴功能

以下功能包含在 0.4.0 中：

- 对话动作播放一遍后保持表情，待机和鼠标悬停不再打断回复；语音生成和播放时气泡不会自动消失，播放失败也保留原回复文字。
- 桌宠旁、简约输入框和完整聊天窗同步显示语音状态，可在准备或播放时停止朗读，保留文字；“再听一次”重读当前角色最近的成功回复，不重新调用聊天模型，也不增加好感度。
- 模型未提供有效表情时保持自然待机，不再因“不开心”含有“开心”而切换到高兴表情。
- 休息和专注提醒会等待对话气泡结束。只保留最新的一条待显示提醒，超过一分钟的旧提醒不再补发。
- 设置分为通用、角色、共同记忆、聊天和语音，底部固定保存按钮；退出前提示未保存的修改。
- 支持流式回复、停止生成与失败重试。快速输入也能停止生成；服务不支持流式时，可在聊天设置中关闭。
- 长回复保留段落，支持滚动、选字和复制。鼠标悬停或键盘焦点停留时暂停隐藏，气泡顶部可直接接话、打开完整聊天、固定或收起回复。
- “对话”旁的“找回上一条回复”会固定显示当前角色最近一条完整回复，不调用模型或语音服务，不改变好感度。收起会停止当前朗读；尚未生成完的回答继续进入聊天记录，不再弹出气泡。要中止生成，请使用聊天窗口的“停止”。聊天记录保存仍为可选，默认关闭。
- 各角色分别保存人设、好感度和对话；模型与语音服务配置共用。升级时旧设定只归到当前角色。
- 在角色页导入文件夹或 ZIP，预览确认后添加，无需修改安装目录。移除导入角色会删除其本地档案和聊天记录，不影响原始文件。
- 自定义语音支持 JSON POST 和 Query GET；GET 模板不能包含嵌套对象或数组。测试会反馈音频播放失败。暂不支持 raw PCM，请选择服务及播放器支持的 WAV、MP3、OGG 或 AAC。

语音朗读默认关闭。设置窗口支持这些语音后端：

- 系统语音：直接使用系统自带声音。
- GPT-SoVITS 本地推理服务：先在本机启动 GPT-SoVITS 的推理服务，再填入类似 `http://127.0.0.1:9880/tts` 的地址。应用会请求这个本地 HTTP 服务，不会替你训练模型。
- 自定义语音接口：适合网络语音服务或自行封装的服务。应用会按 JSON 模板发送请求，模板里用 `{{text}}` 代表要朗读的文字。

点 `测试语音` 会真实请求当前语音配置。GPT-SoVITS 和自定义接口需要返回音频流，或返回包含音频 URL / base64 / data URL 的 JSON。

长回复按段朗读，系统语音和外部语音不再分别截到 500 / 800 字。发新消息、换角色、清空聊天、修改语音配置会停止当前朗读并取消未完成的语音请求。重听会重新使用当前语音服务；外部服务每段会发起一次请求，可能计费。停止不能撤回已发送的文字或保证退回服务商费用。语音仍默认关闭，不录音、不启用麦克风。

桌宠收到回复时会显示更大的气泡，并根据回复内容切换到适合的表情或动作。

### 共同记忆与互动

在 **设置 > 共同记忆** 中填写希望当前角色参考的事情，每行一条，最多 20 条、每条 240 字。勾选“在对话中使用这些记忆”并保存后生效。默认关闭，不会自动从聊天中提取，也不会为整理记忆额外调用模型。

可直接编辑、删除某一行，或清空清单，再保存。记忆按角色独立保存，与聊天记录开关无关。关闭后不再向新请求附加清单，但内容仍留在本机；删除清单不会删除聊天中已提及的内容，也无法撤回已经发给模型服务的数据，必要时请另行清空聊天。清单以本地文本保存，并非密码保险箱；启用后会随对话发送到所选模型服务。模型能否准确参考记忆取决于模型本身。

自动表情模式下，摸头或长按、轻点身体打招呼、拖动后放下会有不同的本地回应，使用角色已有表情。内置角色各有自己的短句，也会使用你设置的称呼。不调用模型、不朗读、不增加好感度；短句不会覆盖已有回复或提醒，也不会打断对话和语音。在 **通用 > 互动短句** 中可关闭短句，保留原来的动作反馈。

点击换表情模式保持手动：一次点击只换一个表情，双击和长按不会额外改变，拖动后恢复原先选中的表情。原有角色图片保持不变，导入模型的使用方式见 [Live2D 指南](docs/live2d.md#简体中文)。

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

内置中日文备用字体采用 SIL Open Font License 1.1，详见[字体许可说明](assets/fonts/NOTICE.md)。
