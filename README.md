# Desktop Pet

一个可以在 Windows / macOS / Linux 上运行的通用桌宠模板。它使用 Electron 做透明置顶窗口，通过角色包加载 spritesheet、动作配置和预览图；当前仓库内置一套默认角色素材，以后可以按同样规格替换成其他角色。

![Desktop pet animation contact sheet](assets/characters/default/preview.png)

## For Beginners

如果只是想下载后直接运行，请看 [小白使用说明.md](小白使用说明.md)。

## Features

- 透明、无边框、置顶小窗口
- 鼠标拖拽移动，拖动时自动播放移动动画
- 左键点击、双击、长按、鼠标靠近都会触发不同反应
- 心情、好感、活力状态会随互动变化
- 右键菜单切换：
  - 角色包
  - 自动表情
  - 点击表情
  - 75% 到 200% 大小
  - 总在最前
  - 回到屏幕右下角
- 实用功能：
  - 当前时间
  - 25 分钟专注提醒
  - 30 / 60 分钟休息提醒
- 对话功能：
  - 右键打开聊天窗口
  - 连接 OpenAI-compatible LLM 接口
  - 根据回复内容自动切换桌宠表情
  - 使用系统语音朗读回复
- 设置会自动保存到本机
- GitHub Actions 可在 Windows / macOS / Linux 上构建安装包并更新 Release

## Download

打开项目页面右侧的 Releases，下载 `Desktop-Pet` 开头、与你系统匹配的文件。

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

本地构建只能稳定生成当前系统对应的平台包。GitHub Actions 会分别在 Windows、macOS 和 Linux runner 上构建三端产物。

## Chat, LLM, And TTS

右键桌宠，选择 `对话 > 打开聊天`。聊天窗口里点 `设置`，填写：

- `Base URL`：OpenAI-compatible 接口地址，例如 `http://localhost:11434/v1`
- `模型名`：接口支持的模型名
- `API key`：需要鉴权的接口才填写，本地模型通常可以留空

API key 只保存在本机。应用会优先用系统安全存储加密；如果当前系统不支持安全持久化，key 只在本次运行中保留。聊天记录只保留在本次运行中，不会写入仓库。

TTS 使用系统自带语音。在聊天设置里打开 `朗读回复` 后，桌宠收到回复时会同步朗读，并根据回复内容切换到适合的表情或动作。

## Character Packs

默认角色包在：

```text
assets/characters/default/
  character.json
  preview.png
  sprite.png
```

角色包约定：

- `character.json`：角色名称、动作行、帧数、播放速度
- `sprite.png`：8 列 spritesheet，默认单帧 768 x 832
- `preview.png`：预览图

默认动作行顺序：

1. idle
2. runningRight
3. runningLeft
4. waving
5. jumping
6. failed
7. running
8. review

新增角色时，在 `assets/characters/` 下增加一个新文件夹，并提供同样结构的三个文件。应用右键菜单会显示可用角色。

## Interaction State

应用会在本机保存简单状态：

- 心情：平静、开心、累了、有点烦
- 好感：正常互动会慢慢提升
- 活力：频繁点击会降低，隔天打开会恢复一些

这些状态只保存在本机应用数据目录，不会上传到仓库或网络。

## License

Code is released under the MIT License. See [ASSET_NOTICE.md](ASSET_NOTICE.md) before publicly redistributing artwork assets.
