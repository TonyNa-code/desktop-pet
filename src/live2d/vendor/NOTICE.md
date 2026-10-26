# Third-Party Runtime Notices

These files are unmodified browser distributions. They are served locally; no CDN is contacted at runtime.

| File | Version | Source | SHA-256 |
| --- | --- | --- | --- |
| `pixi.min.js` | PixiJS 6.5.10 | https://cdn.jsdelivr.net/npm/pixi.js@6.5.10/dist/browser/pixi.min.js | `403f2f2ee8145fa17f60c5c89403056efe2680e5096ec2762036486914ed19c5` |
| `cubism4.min.js` | pixi-live2d-display 0.4.0 | https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/cubism4.min.js | `af1267e6d52759b245766c578d905bfa025b532d5c3cc727c370957c4409e21b` |

PixiJS is MIT licensed, copyright its contributors. See `PIXI-LICENSE.txt`.

pixi-live2d-display is MIT licensed, copyright Guan. See `PIXI-LIVE2D-LICENSE.txt`.

The Cubism display bundle also contains Live2D Cubism Framework components, copyright Live2D Inc., under the [Live2D Open Software License](https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html). See the upstream `CUBISM-FRAMEWORK-LICENSE.md` notice. The surrounding library's MIT license does not replace Live2D's terms.

Cubism Core is proprietary and is not included. The optional local importer recognizes the official Core 5.2 file at https://cubism.live2d.com/sdk-web/core/05/live2dcubismcore.min.js, SHA-256 `25ae938cb4fe282ce189b357bcc97e603d1e1f7ec78bf04150d401c23cdc792f`. Its use is subject to the [Live2D Proprietary Software License](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html).

Applications which load user-supplied models are subject to Live2D's [expandable-application publication terms](https://www.live2d.com/en/sdk/license/expandable/). The repository's MIT license does not replace those terms or grant an SDK publication license.

No Live2D sample or user model is included in this directory or in the application's character assets.
