# Desktop Pet

一个可以在 Windows / macOS / Linux 上运行的通用桌宠模板。它使用 Electron 做透明置顶窗口，通过角色包加载 spritesheet、动作配置和预览图；当前仓库内置一套默认角色素材，以后可以按同样规格替换成其他角色。

![Desktop pet animation contact sheet](assets/characters/default/preview.png)

## For Beginners

如果只是想下载后直接运行，请看 [小白使用说明.md](小白使用说明.md)。

## Features

- 透明、无边框、置顶小窗口
- 鼠标拖拽移动，拖动时自动播放移动动画
- 左键点击切换动作/表情
- 右键菜单切换：
  - 自动表情
  - 点击表情
  - 75% 到 200% 大小
  - 总在最前
  - 回到屏幕右下角
- 设置会自动保存到本机
- GitHub Actions 可在 Windows / macOS / Linux 上构建安装包

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

## License

Code is released under the MIT License. See [ASSET_NOTICE.md](ASSET_NOTICE.md) before publicly redistributing artwork assets.
