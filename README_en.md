# wireless-desc-converter

<p align="center">
  <a href="https://www.npmjs.com/package/wireless-desc-converter"><img src="https://img.shields.io/npm/v/wireless-desc-converter.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/wireless-desc-converter"><img src="https://img.shields.io/npm/dm/wireless-desc-converter.svg" alt="npm downloads"></a>
  <a href="https://www.npmjs.com/package/wireless-desc-converter"><img src="https://img.shields.io/npm/l/wireless-desc-converter.svg" alt="license"></a>
  <a href="https://github.com/chaorenzeng/wireless-desc-converter"><img src="https://img.shields.io/badge/ES5-compatible-brightgreen.svg" alt="ES5"></a>
</p>

> Convert HTML rich text into Taobao's new wireless editor `wirelessDesc` structured JSON.
>
> Zero dependencies · ES5/IE8 compatible · Browser & Node

中文 | [English](./README.md)

---

## Install

```bash
npm install wireless-desc-converter
```

## Quick Start

```javascript
import { htmlToWirelessDesc } from 'wireless-desc-converter';

const desc = await htmlToWirelessDesc(html);
JSON.stringify(desc); // → submit to Taobao API
```

> Without `textImage`, text paragraphs are automatically skipped (Taobao requires `text_N.images` to be non-empty; skipping avoids submission errors when no text-to-image capability is available).

### Full Integration (Image Size + Text-to-Image)

```javascript
import {
  htmlToWirelessDesc,
  createImageSizeResolver,
  createTextImageResolver
} from 'wireless-desc-converter';

const imageSize = createImageSizeResolver(imageMoveResults); // optional cache

const textImageHelper = createTextImageResolver({
  uploadUrl: '/api/upload-base64',
  extraParams: { cid: albumId }
});

const desc = await htmlToWirelessDesc(html, {
  imageSize,
  textImage: textImageHelper.resolver
});

if (textImageHelper.getFailCount() > 0) {
  console.warn(`${textImageHelper.getFailCount()} text segments failed, automatically skipped`);
}
```

When text-to-image fails, resolver returns `[]` and the corresponding `text_N` module is automatically removed — submission is unaffected.

> 📖 **Integration Guide**: [docs/integration-guide.md](./docs/integration-guide.md) — detailed integration steps, API adaptation, common issues and troubleshooting.

## API

### Core

| Method | Description |
|--------|-------------|
| `htmlToWirelessDesc(html, options?)` | HTML → wirelessDesc JSON (async) |
| `buildEmptyWirelessDesc(options?)` | Build empty wirelessDesc |
| `serializeWirelessDesc(desc)` | Serialize to JSON string |
| `validateHeight(desc, maxHeight?)` | Validate total height limit |
| `fillEmptyValues(desc, options?)` | Auto-fill empty fields |

### `htmlToWirelessDesc` Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `imageSize` | `Function` | — | Image size resolver, `({ url }) => Promise<{ width, height } \| null>` |
| `textImage` | `Function` | — | Text-to-image resolver, `({ text, styles, index }) => Promise<Array<{ url, width, height }>>` |
| `imageAspectRatio` | `number` | `0.75` | Image aspect ratio (h/w), used for estimation when size unknown |
| `width` | `string` | `'620'` | Module width |
| `splitHeight` | `string` | `'1240'` | Split height |
| `maxHeight` | `string` | `'100000'` | Max total height |
| `existingModules` | `Array` | — | Existing modules (preserved, cannot be dropped) |

> **`imageAspectRatio`** only affects image module height estimation, not text-to-image. Text canvas height is determined by text line count.

### Built-in Utilities

Available since v1.1.0 — use directly or implement your own callbacks:

| Method | Description | Returns |
|--------|-------------|---------|
| `loadImg(url)` | Async load image to get real dimensions | `Promise<{ hasError, width, height, url }>` |
| `createImageSizeResolver(cache?)` | Image size resolver (cache → loadImg → null fallback) | `Function` |
| `createTextImageResolver(options)` | Text-to-image resolver (Canvas → base64 → upload) | `{ resolver, getFailCount }` |

**`createTextImageResolver` Options:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `uploadUrl` | `''` | Upload endpoint; returns base64 if not set (local debugging) |
| `extraParams` | `{}` | Extra upload parameters |
| `parseResponse` | built-in | Custom response parser, `(res) => url` |
| `canvasWidth` | `620` | Canvas width |
| `paddingTop/Bottom` | `10` | Vertical padding |
| `paddingLeft/Right` | `20` | Horizontal padding |
| `lineHeightRatio` | `1.5` | Line height ratio |
| `maxHeight` | `2000` | Max single image height |
| `fontFamily` | `'sans-serif'` | Font family |
| `quality` | `0.9` | JPEG export quality |

> Built-in `parseResponse` tries: `res.result.picture.picture_path` → `res.result.url` → `res.url`.

### Module Builders

| Method | Description |
|--------|-------------|
| `buildTextModule(params)` | Text module (`text_N`, N starts from **1**) |
| `buildImageModule(params)` | Image hotspot module (`image_hot_area_N`, N starts from **0**) |
| `buildRichTextModule(params)` | Rich text module (preserve existing, set `enable=false`) |
| `buildVersionModule()` | Version module |
| `buildConfigModule(options?)` | Config module |

### Height Estimation

| Method | Description |
|--------|-------------|
| `estimateTextHeight(text, fontSize, width, top, bottom)` | Estimate text render height (`lineHeight = fontSize × 1.2`) |
| `estimateImageHeight(width, aspectRatio?)` | Estimate image height |

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MODULE_WIDTH` | `620` | Default module width |
| `SPLIT_HEIGHT` | `1240` | Split height |
| `MAX_HEIGHT` | `100000` | Max total height |
| `IMAGE_MIN_WIDTH` | `480` | Min image width |
| `IMAGE_MAX_WIDTH` | `1500` | Max image width |
| `IMAGE_MAX_HEIGHT` | `2000` | Max image height |
| `LINE_HEIGHT_RATIO` | `1.2` | Text line height ratio |
| `DEFAULT_IMAGE_ASPECT_RATIO` | `0.75` | Default image aspect ratio |

## Taobao Wireless Editor Rules

- Total module height ≤ **100000px**
- Existing modules cannot be deleted — set `enable=false` instead
- `text_N` starts from **1**, `image_hot_area_N` starts from **0**
- Text must be rendered as image, width 620px, split if > 1240px
- Image width 480~1500px, height ≤ 2000px
- `textStyle.height` must not be empty

## License

MIT
