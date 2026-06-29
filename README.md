# wireless-desc-converter

<p align="center">
  <a href="https://www.npmjs.com/package/wireless-desc-converter"><img src="https://img.shields.io/npm/v/wireless-desc-converter.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/wireless-desc-converter"><img src="https://img.shields.io/npm/dm/wireless-desc-converter.svg" alt="npm downloads"></a>
  <a href="https://www.npmjs.com/package/wireless-desc-converter"><img src="https://img.shields.io/npm/l/wireless-desc-converter.svg" alt="license"></a>
  <a href="https://github.com/chaorenzeng/wireless-desc-converter"><img src="https://img.shields.io/badge/ES5-compatible-brightgreen.svg" alt="ES5"></a>
</p>

> 将 HTML 富文本转换为淘宝新版图文编辑器 `wirelessDesc` 结构化 JSON。
>
> 零依赖 · 兼容 ES5/IE8 · 浏览器 & Node 通用

[English](./README_en.md) | 中文

---

## 安装

```bash
npm install wireless-desc-converter
```

## 快速集成

```javascript
import { htmlToWirelessDesc } from 'wireless-desc-converter';

const desc = await htmlToWirelessDesc(html);
JSON.stringify(desc); // → 提交到淘宝接口
```

> 不传 `textImage` 时文字段落自动跳过（淘宝要求 `text_N.images` 非空，无合图能力时跳过避免报错）。

### 完整集成（图片尺寸 + 文字合图）

```javascript
import {
  htmlToWirelessDesc,
  createImageSizeResolver,
  createTextImageResolver
} from 'wireless-desc-converter';

const imageSize = createImageSizeResolver(imageMoveResults); // 可选缓存

const textImageHelper = createTextImageResolver({
  uploadUrl: '/api/upload-base64',
  extraParams: { cid: albumId }
});

const desc = await htmlToWirelessDesc(html, {
  imageSize,
  textImage: textImageHelper.resolver
});

if (textImageHelper.getFailCount() > 0) {
  console.warn(`${textImageHelper.getFailCount()} 个文字段合图失败，已自动跳过`);
}
```

合图失败时 resolver 返回 `[]`，对应 `text_N` 模块自动移除，不影响提交。

## API

### 核心

| 方法 | 说明 |
|------|------|
| `htmlToWirelessDesc(html, options?)` | HTML → wirelessDesc JSON（async） |
| `buildEmptyWirelessDesc(options?)` | 构造空 wirelessDesc |
| `serializeWirelessDesc(desc)` | 序列化为 JSON 字符串 |
| `validateHeight(desc, maxHeight?)` | 校验总高度是否超限 |
| `fillEmptyValues(desc, options?)` | 自动填充空值字段 |

### `htmlToWirelessDesc` 选项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `imageSize` | `Function` | — | 图片尺寸获取，`({ url }) => Promise<{ width, height } \| null>` |
| `textImage` | `Function` | — | 文字合图，`({ text, styles, index }) => Promise<Array<{ url, width, height }>>` |
| `imageAspectRatio` | `number` | `0.75` | 图片宽高比（高/宽），无尺寸时用于估算 |
| `width` | `string` | `'620'` | 模块宽度 |
| `splitHeight` | `string` | `'1240'` | 切图高度 |
| `maxHeight` | `string` | `'100000'` | 最大总高度 |
| `existingModules` | `Array` | — | 已有模块（保留提交，不可丢弃） |

> **`imageAspectRatio`** 仅用于普通图片模块的高度估算，与文字合图无关。文字合图画布高度由文字行数决定。

### 内置工具方法

从 v1.1.0 起内置，可直接使用或自行实现回调：

| 方法 | 说明 | 返回值 |
|------|------|--------|
| `loadImg(url)` | 异步加载图片获取真实尺寸 | `Promise<{ hasError, width, height, url }>` |
| `createImageSizeResolver(cache?)` | 图片尺寸解析器（缓存 → loadImg → null 三级降级） | `Function` |
| `createTextImageResolver(options)` | 文字合图解析器（Canvas → base64 → 上传） | `{ resolver, getFailCount }` |

**`createTextImageResolver` 选项：**

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `uploadUrl` | `''` | 上传接口地址，不传则返回 base64（本地调试） |
| `extraParams` | `{}` | 上传额外参数 |
| `parseResponse` | 内置 | 自定义响应解析，`(res) => url` |
| `canvasWidth` | `620` | 画布宽度 |
| `paddingTop/Bottom` | `10` | 上下内边距 |
| `paddingLeft/Right` | `20` | 左右内边距 |
| `lineHeightRatio` | `1.5` | 行高倍率 |
| `maxHeight` | `2000` | 单张图片最大高度 |
| `fontFamily` | `'sans-serif'` | 字体 |
| `quality` | `0.9` | JPEG 导出质量 |

> 内置 `parseResponse` 默认尝试：`res.result.picture.picture_path` → `res.result.url` → `res.url`。

### 模块构造

| 方法 | 说明 |
|------|------|
| `buildTextModule(params)` | 文字模块（`text_N`，N 从 **1** 开始） |
| `buildImageModule(params)` | 图片热区模块（`image_hot_area_N`，N 从 **0** 开始） |
| `buildRichTextModule(params)` | 富文本模块（保留已存在的，设 `enable=false`） |
| `buildVersionModule()` | version 模块 |
| `buildConfigModule(options?)` | config 模块 |

### 高度估算

| 方法 | 说明 |
|------|------|
| `estimateTextHeight(text, fontSize, width, top, bottom)` | 估算文本渲染高度（`lineHeight = fontSize × 1.2`） |
| `estimateImageHeight(width, aspectRatio?)` | 估算图片高度 |

### 常量

| 常量 | 值 | 说明 |
|------|-----|------|
| `MODULE_WIDTH` | `620` | 模块默认宽度 |
| `SPLIT_HEIGHT` | `1240` | 切图高度 |
| `MAX_HEIGHT` | `100000` | 最大总高度 |
| `IMAGE_MIN_WIDTH` | `480` | 图片最小宽度 |
| `IMAGE_MAX_WIDTH` | `1500` | 图片最大宽度 |
| `IMAGE_MAX_HEIGHT` | `2000` | 图片最大高度 |
| `LINE_HEIGHT_RATIO` | `1.2` | 文本行高倍率 |
| `DEFAULT_IMAGE_ASPECT_RATIO` | `0.75` | 图片默认宽高比 |

## 淘宝图文编辑器规则

- 模块总高度 ≤ **100000px**
- 已有模块不能删除，须设 `enable=false`
- `text_N` 从 **1** 开始，`image_hot_area_N` 从 **0** 开始
- 文字需合成图片提交，宽度 620px，超过 1240px 需切图
- 图片宽度 480~1500px，高度 ≤ 2000px
- `textStyle.height` 不能为空

## License

MIT
