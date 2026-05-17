# Desktop Pet

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

[![Build](https://github.com/TonyNa-code/desktop-pet/actions/workflows/build.yml/badge.svg)](https://github.com/TonyNa-code/desktop-pet/actions/workflows/build.yml)
[![Latest Release](https://img.shields.io/github/v/release/TonyNa-code/desktop-pet?label=latest%20release)](https://github.com/TonyNa-code/desktop-pet/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)

Windows / macOS / Linux で動くアニメ風デスクトップペットです。キャラクターパック、多言語UI、チャットモデル連携、任意の音声読み上げに対応しています。Electron で透明な常時手前表示ウィンドウを作り、各キャラクターは spritesheet、プレビュー画像、`character.json` から読み込みます。

<p align="center">
  <img src="docs/desktop-pet-demo.gif" alt="Desktop Pet animated preview" width="256" />
</p>

## クイックダウンロード

[latest release](https://github.com/TonyNa-code/desktop-pet/releases/latest) を開き、自分のOSに合うファイルをダウンロードしてください。

| システム | ファイル | メモ |
| --- | --- | --- |
| Windows インストーラー | `Desktop-Pet-*-win-x64-setup.exe` | 64-bit Windows 向け。 |
| Windows ポータブル | `Desktop-Pet-*-win-x64-portable.exe` | インストールせず使いたい場合。 |
| macOS Apple Silicon | `Desktop-Pet-*-mac-arm64.dmg` | M1/M2/M3/M4 Mac に推奨。 |
| macOS zip | `Desktop-Pet-*-mac-arm64.zip` | zip パッケージを使いたい場合。 |
| Linux | `Desktop-Pet-*-linux-x86_64.AppImage` | ポータブル AppImage。 |
| Linux archive | `Desktop-Pet-*-linux-x64.tar.gz` | AppImage が合わない場合。 |

macOS で開発元を確認できないと表示された場合は、app を右クリックして `開く` を選び、もう一度確認してください。未署名のオープンソーステストビルドではよくあります。

## Desktop Pet の特徴

- まず小さなデスクトップコンパニオンとして使える設計です。
- キャラクターパックは `sprite.png`、`preview.png`、`character.json` のシンプルな構成です。
- システム言語、簡体字中国語、English、日本語に対応します。
- チャットと音声は任意機能なので、軽量なペットとしても使えます。

## 組み込みキャラクター

| Default Character | Luna |
| --- | --- |
| ![Default character preview](assets/characters/default/preview.png) | ![Luna character preview](assets/characters/luna/preview.png) |
| 待機、移動、手振り、ジャンプ、失敗、考え中などを含む動的アクションサンプルです。 | ツンデレ、照れ、驚き、喜び、考え中などを含む、表情中心の静的寄りパックです。 |

## ガイド

ダウンロードして実行するだけなら [快速上手指南.md](快速上手指南.md) を見てください。キャラクターを差し替えたり作成したい場合は [角色更换与制作指南.md](角色更换与制作指南.md) を見てください。

## 機能

- 透明、フレームなし、常に手前の小さなペットウィンドウ
- 表示言語：システムに合わせる、簡体字中国語、English、日本語
- ドラッグ移動中に移動アニメーションを再生
- クリック、ダブルクリック、長押し、マウスホバーに反応
- 右クリックメニュー：
  - キャラクターパック
  - 自動表情
  - クリックで表情変更
  - 75% から 200% までのサイズ
  - 常に手前
  - 右下に戻す
  - 表示言語
- 便利機能：
  - 現在時刻
  - 25分集中リマインダー
  - 30 / 60分休憩リマインダー
- 会話機能：
  - 返信をペットの吹き出しに表示するクイック入力ウィンドウ
  - 小さなフローティングチャットウィンドウ
  - 独立した会話設定ウィンドウ
  - 設定画面でプレビュー付きキャラクター切り替え
  - 一般的な `/chat/completions` 形式のサービスに接続
  - 人物設定、話し方、任意の好感度段階をカスタマイズ
  - 返信内容に応じてペットの表情を自動変更
  - システム音声、ローカル GPT-SoVITS 推論サービス、またはカスタム音声APIで返信を読み上げ
- 設定はローカルに保存
- GitHub Actions で Windows / macOS / Linux のパッケージをビルドし、latest release を更新

## ソースから実行

```bash
npm install
npm start
```

## 検証

```bash
npm run check
```

JavaScript 構文、キャラクターパック寸法、ローカルパスや誤コミットされたシークレットなどの一般的なプライバシー漏れをチェックします。

```bash
npm run privacy:check
```

## ビルド

```bash
npm run build
```

ローカルビルドでは基本的に現在のOS向けパッケージを生成します。GitHub Actions では Windows、macOS、Linux runner でそれぞれ三端末向け成果物を作ります。

## チャット、人物設定、音声

言語は `右クリックメニュー > 言語` または `会話設定 > 一般 > 表示言語` から変更できます。メニュー、ウィンドウ、吹き出し、会話の既定言語に反映されます。

ペットを右クリックして `会話 > クイック入力` を選ぶと、リアルタイム陪伴向けの最小入力欄が開きます。返信はペットの吹き出しに直接表示されます。`会話 > チャット画面` では履歴付きの小さなフローティングチャット、`会話 > 会話設定` では設定画面を開けます。

初回起動時には設定画面が自動で開きます。`人物設定` はキャラクター名、性格、話し方、背景、追加ルールに影響します。未入力の場合は現在のキャラクターパックの既定スタイルを使います。

`好感度` は既定ではオフです。有効にすると、有効な会話時間によってのみゆっくり増えます。クリック、ダブルクリック、長押し、表情変更、アプリ起動では増えません。

チャットモデル設定：

- プリセット：`Ollama`、`LM Studio`、`DeepSeek`、`カスタムAPI` は一般的な Base URL とモデル名の初期値を入力します。
- DeepSeek プリセット：現在は `https://api.deepseek.com` と `deepseek-v4-flash` を低摩擦な初期値として使います。別の DeepSeek モデルを使う場合はモデル名を変更してください。
- `Base URL`：`/chat/completions` 互換のエンドポイント。例：ローカルモデルサービスの `http://localhost:11434/v1`、または互換クラウドAPIのURL
- `モデル名`：サービスが対応しているモデル名。ローカルでもクラウドでも必要です
- `API key`：認証が必要なサービスだけ入力します。ローカルモデルでは通常空欄で構いません

`チャット接続をテスト` は現在の入力内容で実際にリクエストを送り、成功すると短いモデル返信を表示します。

API key はこの端末だけに保存されます。利用できる場合はOSの安全な保存機能で暗号化します。安全な永続化が使えない環境では、その起動中だけ保持します。チャット履歴はメモリ上だけに残り、リポジトリには書き込まれません。

音声読み上げは既定ではオフです。対応する音声バックエンド：

- システム音声：OS標準の音声を使います。
- GPT-SoVITS ローカル推論サービス：先にローカルで GPT-SoVITS の推論サービスを起動し、`http://127.0.0.1:9880/tts` のようなURLを入力します。アプリはそのローカルHTTPサービスを呼び出すだけで、モデルの学習は行いません。
- カスタム音声API：クラウド音声サービスや自作ラッパー向けです。`{{text}}` を読み上げテキストに置き換えた JSON テンプレートを送信します。

`音声をテスト` は現在の音声設定で実際にリクエストします。GPT-SoVITS とカスタムAPIは音声ストリーム、または音声URL / base64 / data URL を含む JSON を返す必要があります。

## キャラクターパック

組み込みパック：

- `default`：8行の基本アクションを持つ動的サンプル。
- `luna`：複数の表情状態を持つ静的寄りの表情パック。

キャラクターパックの場所：

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

パック内のファイル：

- `character.json`：キャラクター名、アクション行、フレーム数、再生速度
- `sprite.png`：spritesheet。既定は8列、1フレーム 768 x 832
- `preview.png`：プレビュー画像

基本アクション行：

1. idle
2. runningRight
3. runningLeft
4. waving
5. jumping
6. failed
7. running
8. review

キャラクターを追加するには、`assets/characters/` の下に新しいフォルダを作り、同じ3ファイルを用意します。完全な動的アクション表でも、表情中心の静的寄りパックでも構いません。利用可能なキャラクターは右クリックメニューに表示されます。

## ローカル状態

アプリはウィンドウ設定、キャラクター設定、人物設定、チャット設定、好感度、会話時間などの簡単な状態をローカルに保存します。

これらはこの端末のアプリデータディレクトリに保存され、リポジトリやネットワークにはアップロードされません。

## Contributing

ローカル開発、PR チェック、キャラクターパックの貢献については [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## License

Code is released under the MIT License. See [ASSET_NOTICE.md](ASSET_NOTICE.md) before publicly redistributing artwork assets.
