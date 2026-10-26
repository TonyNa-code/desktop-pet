# Live2D Preview

[English](#english) | [简体中文](#简体中文) | [日本語](#日本語)

## English

This experimental source branch is not part of the 0.4.x releases. Sprite characters remain available and keep their existing controls.

### Import a Model

1. Open **Companion Settings > Character > Import Live2D**.
2. Select a `.model3.json` file with its accompanying files still in their original folders, or a ZIP containing exactly one model. A `.moc3` file alone is not sufficient.
3. Confirm the import and select the new character.
4. For the first Live2D character, use **Download Core 5.2**, save the official `live2dcubismcore.min.js`, and choose it with **Install Core**. Only the recognized official file is accepted. Core is stored locally, not in the project.
5. Use the expression and motion menus to preview the model's own artwork. Assign its expressions to **Happy**, **Shy**, **Thoughtful** and **Sad**, then save. The default mapping is neutral because names such as `F01` have no universal meaning.

**Click expression mode:** one click selects the next native expression, including neutral. Idle motions and pointer tracking stop; blinking and breathing continue. Double clicks and long presses do not start an automatic expression loop. Motion preview is unavailable in this mode.

**Automatic mode:** subtle pointer tracking, local touch reactions and the model's idle motion at roughly 45-60 second intervals. A chat reply holds its assigned expression. Idle gestures pause while a reply is displayed or spoken. Turn off pointer tracking or interaction phrases independently in settings.

**Head pats and gentle taps:** assign separate expressions and optional motions in Character settings. A touch eases in and out and returns to the previous expression; repeated taps do not stack. Typing, dragging and a new reply interrupt the reaction. Models with native hit areas use those regions. Other models use their visible silhouette and a height-based head/body split. Empty space does not trigger a reaction. Older imports need reimporting to gain their native hit areas; this adds a separate character without deleting the old one.

Turn off **Occasional idle gestures** for quiet company. Blinking, breathing, touch reactions and reply gestures still work. Pointer tracking has its own switch. Touch phrases can be disabled without disabling touch animation, and touches do not call an API or increase affection.

**Voice:** external TTS audio drives mouth opening from its volume. This is not phoneme-level lip synchronization. System voices have no audio analyser and do not drive this mouth animation. A model needs mouth parameters for the effect to appear.

For a closer companion tone, choose **Relationship > Partner**, set your preferred name, and describe the character's personality. Partner touch phrases remain local and make no model request. Affection, saved chat history and shared memories remain off by default.

### Talking Beside Your Character

The speech icon opens a small input beside the character. Enter sends your message and folds the input away; replies appear just above the character. Escape closes the input without losing its draft. The book icon opens the full conversation, sharing the same draft and history. A failed request keeps your unsent text for another attempt.

In automatic mode, a Live2D character gently centers its gaze while you type or wait for a reply. Its own blink and breath continue; random idle gestures wait until the conversation settles. Click expression mode keeps the expression you selected. External voice playback has a compact stop/replay control beside the character.

Under **Reply gestures**, you can also assign a native motion to each reply mood. All start with **No gesture**. A completed reply can play one selected motion, not one per streamed text chunk. Gestures are spaced apart during quick exchanges, and a new message interrupts the previous gesture. Starting voice playback does not cancel the current reply gesture. Click expression mode disables reply gestures.

### Compatibility

- Cubism 3/4 `.model3.json` exports with `.moc3`, PNG textures, `.exp3.json`, `.motion3.json`, physics and pose files.
- Some newer exports may work with Core 5.2, but this renderer does not promise all Cubism 5.x features. Cubism 5.3 extended blend modes, `.model.json`/Cubism 2, editable `.cmo3`, PSD, VRM and 3D models are not supported.
- Maximum 128 MiB per import, 256 files, 8 textures, 8192 pixels per texture dimension and 64 million total texture pixels. Each JSON file must be under 2 MiB.
- No embedded scripts, model audio, remote textures, external URLs or symbolic links are installed. Only the model's required files are copied. Removing a character does not delete its original folder.
- Animation quality depends on the rig and textures provided with the model. Importing a flat illustration does not create a rig.

### Test Model and Terms

The local test uses **Haru**, an official Live2D sample from [CubismWebSamples 4-r.7](https://github.com/Live2D/CubismWebSamples/tree/4-r.7/Samples/Resources/Haru), revision `de9eb4bec4326b81fe67a54e84322fdc39bc7446`. Haru is copyright Live2D Inc. and is available under the [Free Material License](https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html), with the [sample model terms](https://www.live2d.com/eula/live2d-sample-model-terms_en.html). It is a test fixture, not a bundled character or a model covered by this repository's MIT license.

Local runtime checks also cover **Epsilon FREE** and **Mao PRO** samples: visible canvas content, native blinking and breathing, pointer tracking, expressions, motion preview, inline conversation, and audio-driven mouth movement. These sample assets are not included in this repository.

Cubism Core is proprietary. The Framework and model assets also have their own licenses. Applications with user-loadable models are subject to the [official SDK publication terms](https://www.live2d.com/en/sdk/license/expandable/). The repository's MIT license does not cover those components or grant an SDK publication license. Neither Core nor sample models are bundled. [Third-party notices](../src/live2d/vendor/NOTICE.md).

### Privacy

Imported models render in a separate sandboxed frame with no settings, chat history, API key or filesystem bridge. The frame only receives model selection, gesture controls and numeric audio levels. It cannot contact external servers. Model importing itself does not call an LLM or TTS service.

Chat and spoken text still go to the services you explicitly configure. Returned TTS audio links must share the configured service's origin; redirects and cross-origin audio links are rejected. A provider using a separate CDN must return audio bytes/base64 directly or provide a same-origin audio endpoint.

## 简体中文

这是源码分支中的实验功能，不在 GitHub 0.4.x 安装包中。原有图片桌宠和设置保持不变。

1. 打开 **陪伴设置 > 角色 > 导入 Live2D**，选择模型的 `.model3.json`，或仅含一个模型的 ZIP。纹理、动作等文件需保留原有目录结构；单独的 `.moc3` 无法使用。
2. 确认导入并切换到新角色。首次使用时点 **下载 Core 5.2**，保存官方 `live2dcubismcore.min.js`，再通过 **安装 Core** 选择这个文件。程序只接受已核验的官方文件，运行库保存在本机数据目录。
3. 预览模型自带的表情、动作，将合适的表情分配给开心、害羞、思考和难过，保存后随聊天回复变化。默认不猜测 `F01` 等名称的含义。
4. 右键切换表情模式或人物大小。点击模式下一次点击换一个表情，不会变成自动轮播；眨眼和呼吸保留，注视和待机动作关闭。自动模式下才会有鼠标注视、触碰反应和低频待机动作，回复展示或朗读期间暂停待机动作。
5. 外部 TTS 的实际音量可以驱动张嘴，停止朗读后收口。它不是逐音素口型；系统语音暂不驱动口型，模型也需要对应的嘴部参数。

想要更亲近的口吻，可以将人物关系设为 **恋人**，填写希望被称呼的名字和人物性格。恋人关系的触碰短句在本地运行，不调用 API。好感度、保存聊天记录、共同记忆依旧默认关闭。

角色设置中的 **摸摸头** 和 **轻轻碰一下** 可以分别指定表情、动作。触碰会平滑开始、结束并恢复原表情，连续点击不会叠加；开始输入、拖动或收到新回复时会结束触碰反馈。优先使用模型自带的触碰区域；没有区域的模型按可见轮廓和上下位置区分，点空白处不回应。旧版已导入的模型需重新导入才能使用原生区域，会新增一个角色，原角色和记录保留。

关闭 **偶尔播放待机动作** 后，呼吸、眨眼、触碰和回复动作仍然保留。鼠标注视、互动短句各有独立开关，关掉短句也可以保留触碰动画。触碰不调用 API，也不增加好感度。

点人物旁的对话图标即可展开小输入框，按回车发送后自动收起，回复显示在人物上方。按 Esc 可收起并保留草稿；点书本图标可看完整聊天记录，两处共用草稿。请求失败时也会保留未发送的文字。自动模式下，输入和等待回复时人物会轻轻看向你，保持眨眼、呼吸，暂缓待机动作。点击模式不改变手动选中的表情。朗读的停止、重播按钮在人物身旁。

在 **回复动作** 中可以为各个情绪选择模型自带动作，默认均不播放。一条完整回复最多触发一次，逐字输出时不会重复触发；连续短回复也不会让动作连着播放。开始朗读会保留当前回复动作，发出新消息则会中止上一动作。点击表情模式不播放回复动作。

支持 Cubism 3/4 导出的模型、PNG、表情、动作、物理和姿态文件。不能把一张立绘自动变成 Live2D，也不支持 Cubism 2、编辑工程 `.cmo3`、PSD、VRM 或 Cubism 5.3 的扩展混合模式。单包上限 128 MiB、256 文件、8 张纹理，单张最长边 8192，纹理总像素不超过 6400 万，单个 JSON 不超过 2 MiB。

测试使用的是官方 Haru 示例，版权属于 Live2D Inc.，不是 MIT 角色素材；下载来源和许可见上方链接。Core 也不是开源库。允许用户加载模型的应用适用 Live2D 的公开发布条款，仓库的 MIT 许可不替代这些条款。仓库和安装包均不附带 Core 或测试模型。

本地也已用 Epsilon FREE 和 Mao PRO 验证显示、眨眼、呼吸、注视、表情、动作、人物旁对话和音量口型。这些模型文件不会随仓库一起发布。

模型只在隔离窗口中接收动作参数和音量，不会拿到密钥、聊天记录或文件系统权限，也不能联网加载素材。导入不会覆盖原始文件。聊天和 TTS 仍只使用你配置的服务；服务返回的音频链接必须与服务地址同来源，否则应改为直接返回音频。

## 日本語

ソースブランチで試せる実験的な機能です。公開版 0.4.x には含まれていません。既存のスプライトキャラクターはそのまま使えます。

1. **付き添い設定 > キャラクター > Live2D を追加** から `.model3.json`、またはモデルが一つだけ入った ZIP を選びます。関連ファイルのフォルダー構成を保ってください。`.moc3` 単体では使えません。
2. 追加したキャラクターを選択します。初回は **Core 5.2 をダウンロード** から公式の `live2dcubismcore.min.js` を保存し、**Core を導入** で選びます。確認済みの公式ファイルのみ受け付けます。
3. 表情とモーションを試し、返答時の「うれしい・照れる・考え中・悲しい」に割り当てて保存します。`F01` などの意味はモデルごとに異なるため、初期値は自然な表情です。
4. クリック表情モードでは一回のクリックで一つ進みます。自動切り替えや視線追従は止まりますが、まばたきと呼吸は続きます。自動モードの待機動作は低頻度で、返答表示中や読み上げ中は止まります。
5. 外部 TTS の音量で口を動かします。音素単位のリップシンクではありません。システム音声は口の動きに対応していません。

関係を「恋人」にし、呼び名と性格を設定すると、会話やローカルの触れ合い短文も親しみのある口調になります。好感度、履歴保存、共通の記憶は初期状態では無効です。

**頭をなでる** と **そっと触れる** に別々の表情・モーションを設定できます。反応は滑らかに始まり、元の表情に戻ります。連打で重ならず、入力・ドラッグ・新しい返答で中断します。モデルの当たり判定を優先し、ない場合は表示部分と上下の位置で判定します。空白には反応しません。以前のインポートで当たり判定を利用するには再インポートが必要です。別のキャラクターとして追加され、元の設定や履歴は残ります。

**ときどき待機モーションを再生** を無効にしても、まばたき・呼吸・触れ合い・返答時の動作は続きます。視線追従と触れ合いの一言は別々に切り替えられます。触れ合いでは API を呼び出さず、好感度も増えません。

キャラクター横の会話アイコンで小さな入力欄が開きます。Enter で送信すると閉じ、返答はキャラクターのすぐ上に表示されます。Esc で閉じても下書きは残ります。本のアイコンから開く会話履歴とも下書きを共有します。送信失敗時も入力内容は保持されます。自動モードでは入力中や返答待ちに視線をそっと中央に戻し、まばたきと呼吸を続けます。クリック表情モードでは選んだ表情を保ちます。音声の停止・再生はキャラクター横の小さなボタンで操作できます。

**返答時のモーション** では、感情ごとにモデルの動作を選べます。初期値はすべて「モーションなし」です。一つの返答につき一度だけ再生し、文字の逐次表示や短い返答の連続で動作を繰り返しません。読み上げ開始時も動作を保ち、新しいメッセージで前の動作を中断します。クリック表情モードでは再生しません。

Cubism 3/4 の書き出しモデルに対応します。Cubism 2、`.cmo3` 編集ファイル、PSD、VRM、Cubism 5.3 の拡張ブレンドは非対応です。128 MiB・256 ファイル・PNG 8 枚まで、各辺 8192 ピクセル以下、合計 6400 万ピクセル以下、JSON は一つ 2 MiB 以下です。

テストには Live2D Inc. の公式 Haru を使用しました。MIT 素材ではなく、上記の専用利用規約が適用されます。Core はプロプライエタリです。ユーザーモデルを読み込むアプリには Live2D の公開条件が適用され、リポジトリの MIT ライセンスで代替できません。Core とテストモデルは同梱されません。

Epsilon FREE と Mao PRO でも表示、まばたき、呼吸、視線、表情、モーション、会話、音量による口の動きをローカルで確認しています。これらのモデルはリポジトリに含まれません。

モデルは設定・会話・API キー・ファイル操作の権限を持たない隔離フレームで表示され、外部通信もできません。会話と TTS だけは設定したサービスに送信されます。音声の返却リンクは TTS サービスと同一オリジンである必要があります。
