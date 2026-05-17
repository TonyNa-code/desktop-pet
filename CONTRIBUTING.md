# Contributing

Thanks for helping improve Desktop Pet. Small, focused pull requests are easiest to review.

## Local Setup

```bash
npm install
npm start
```

Run the full local check before opening a pull request:

```bash
npm run check
```

## Good First Contributions

- Improve menu text or translations in `src/i18n.js`
- Fix UI layout issues in `src/*.css`
- Improve character-pack validation in `scripts/validate-assets.js`
- Add or refine documentation
- Add a character pack following `角色更换与制作指南.md`

## Pull Request Checklist

- Keep the change focused on one topic.
- Run `npm run check`.
- For UI changes, include a screenshot or short GIF in the PR.
- For character packs, include `character.json`, `sprite.png`, and `preview.png`.
- Do not include API keys, private chat logs, machine-specific paths, or temporary local files.
- If artwork licensing or credits change, update `ASSET_NOTICE.md`.

## Project Shape

Desktop Pet is meant to stay lightweight: a small desktop companion first, with chat and voice as optional features. Prefer simple character-pack conventions and clear UI over large framework changes.
