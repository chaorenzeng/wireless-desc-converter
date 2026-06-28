# wireless-desc-converter

<p align="center">
  <a href="https://www.npmjs.com/package/wireless-desc-converter">
    <img src="https://img.shields.io/npm/v/wireless-desc-converter.svg" alt="npm version">
  </a>
  <a href="https://www.npmjs.com/package/wireless-desc-converter">
    <img src="https://img.shields.io/npm/dm/wireless-desc-converter.svg" alt="npm downloads">
  </a>
  <a href="https://www.npmjs.com/package/wireless-desc-converter">
    <img src="https://img.shields.io/npm/l/wireless-desc-converter.svg" alt="license">
  </a>
  <a href="https://github.com/chaorenzeng/wireless-desc-converter">
    <img src="https://img.shields.io/badge/ES5-compatible-brightgreen.svg" alt="ES5">
  </a>
</p>

淘宝新版图文编辑器 `wirelessDesc` 适配工具 —— 将 HTML 富文本转换为淘宝新版图文编辑器结构化 JSON。

零依赖，兼容 ES5 / IE8，可直接在任何 JS 环境使用。

## 背景

淘宝旺铺新版图文编辑器（1.0.0+）不再区分电脑端和手机端，统一使用 `wireless_desc` 字段。旧的 `description` 和 `wap_desc` 已废弃。

本工具将旧版 HTML 富文本（`desc` 字段）自动转换为符合新版接口要求的结构化 JSON。

## 安装

```bash
npm install wireless-desc-converter
```

## 快速开始

### 最简用法

```javascript
import { htmlToWirelessDesc } from 'wireless-desc-converter';

const html = '<p><h2>上新推荐</h2><img src="https://img.alicdn.com/imgextra/xxx.jpg"><br></p>';

// 直接 await 即可
const desc = await htmlToWirelessDesc(html);
const jsonStr = JSON.stringify(desc);  // 接口提交
```

> **注意**：最简用法下，不传 `textImage` 合图函数时，文字段落会被**自动跳过**（不生成 `text_N` 模块）。
> 淘宝接口要求 `text_N.images` 不能为空，无合图能力时生成空模块会导致提交报错。

### 需要图片尺寸 / 文字合图

```javascript
import { htmlToWirelessDesc } from 'wireless-desc-converter';

const desc = await htmlToWirelessDesc(html, {
  imageSize: async ({ url }) => {
    const res = await fetch('/api/image-size?url=' + url);
    return res.json();  // 返回 { width, height }
  },
  textImage: async ({ text, styles, index }) => {
    const res = await fetch('/api/text-to-image', {
      method: 'POST',
      body: JSON.stringify({ text, styles })
    });
    return res.json();  // 返回 [{ url, width, height }]
  }
});

const jsonStr = JSON.stringify(desc);  // 提交
```

也可以只传其中一个：

```javascript
// 只补全图片尺寸
const desc = await htmlToWirelessDesc(html, {
  imageSize: async ({ url }) => getImageSize(url)
});

// 只合图（图片尺寸用 imageAspectRatio 自动估算）
const desc = await htmlToWirelessDesc(html, {
  textImage: async ({ text, styles, index }) => renderTextAsImage(text, styles),
  imageAspectRatio: 0.75   // 高/宽比，默认 0.75（4:3）
});
```

### 手动构造模块

```javascript
import {
  buildTextModule,
  buildImageModule,
  buildVersionModule,
  buildConfigModule,
  buildEmptyWirelessDesc
} from 'wireless-desc-converter';

// 单独构造文字模块（text_1, text_2, ...）
const textModule = buildTextModule({
  text: '商品描述文字',
  images: [{ url: '合图URL', width: 620, height: 62 }],
  styles: { fontSize: '28', color: '#ff0000', textAlign: 'center' },
  index: 1
});

// 单独构造图片热区模块（image_hot_area_0, image_hot_area_1, ...）
const imageModule = buildImageModule({
  url: 'https://img.alicdn.com/imgextra/xxx.jpg',
  width: 620,
  height: 827,
  hotAreas: [
    { start_x: '0.1', start_y: '0.2', end_x: '0.9', end_y: '0.8', link: 'https://...' }
  ],
  index: 0
});

// 构造完整 wirelessDesc
const wirelessDesc = buildEmptyWirelessDesc();
wirelessDesc.value.props.unshift(imageModule, textModule);
```

## 实战参考：图片尺寸 & 文字合图实现

上面展示了 `imageSize` 和 `textImage` 的占位用法，实际项目中需要自己实现。以下是经过上线验证的参考实现，可直接复制改接口地址使用。

### loadImg — 图片加载 & 尺寸获取

最基础的工具函数，创建一个 `Image` 对象异步加载图片，返回真实宽高：

```javascript
/**
 * 加载图片，获取真实尺寸
 * @param {string} url - 图片地址
 * @returns {Promise<{ hasError: boolean, width: number, height: number, url: string }>}
 */
function loadImg(url) {
  return new Promise(function(resolve) {
    if (!url) {
      resolve({ hasError: true, url: url });
      return;
    }
    var img = new Image();
    img.onload = function() {
      resolve({
        hasError: !!(img.width === 1 && img.height === 1),
        width: img.width,
        height: img.height,
        url: url
      });
    };
    img.onerror = function() {
      resolve({ hasError: true, width: img.width, height: img.height, url: url });
    };
    img.src = url;
  });
}
```

### createImageSizeResolver — 图片尺寸解析器

供 `htmlToWirelessDesc` 的 `imageSize` 选项使用。三级降级策略：缓存命中 → 异步加载 → 返回 null 交由估算兜底：

```javascript
/**
 * 创建图片尺寸解析器
 *
 * 解析优先级：
 *   1. 从缓存中匹配（如图片搬家接口返回的尺寸信息）
 *   2. 通过 loadImg 异步加载获取真实尺寸
 *   3. 返回 null，由 fillEmptyValues 兜底估算
 *
 * @param {Array} [cache] - 缓存数组，每项 { url, width, height }
 * @returns {Function} async resolver: ({ url }) => Promise<{ width, height } | null>
 */
function createImageSizeResolver(cache) {
  cache = cache || [];

  return async function({ url }) {
    if (!url) return null;

    // 1. 从缓存中查找匹配
    for (var i = 0; i < cache.length; i++) {
      var item = cache[i];
      if (item.url && url.indexOf(item.url) === 0 && item.width > 0 && item.height > 0) {
        return { width: item.width, height: item.height };
      }
    }

    // 2. 通过 loadImg 异步加载获取真实尺寸
    try {
      var imgData = await loadImg(url);
      if (imgData && !imgData.hasError && imgData.width > 1 && imgData.height > 1) {
        return { width: imgData.width, height: imgData.height };
      }
    } catch (e) {}

    // 3. 返回 null，由 fillEmptyValues 兜底估算
    return null;
  };
}
```

用法：

```javascript
// cache 可以是图片搬家接口的返回结果，格式: [{ url, width, height }, ...]
var imageSizeResolver = createImageSizeResolver(imageMoveResults);

var desc = await htmlToWirelessDesc(html, {
  imageSize: imageSizeResolver
});
```

### createTextImageResolver — 文字合图解析器

供 `htmlToWirelessDesc` 的 `textImage` 选项使用。用 Canvas 将文字渲染成图片 → 导出 base64 → 上传到图片空间：

```javascript
/**
 * 创建文字合图解析器
 *
 * 流程：
 *   1. 用 Canvas 将文字渲染成图片（按 styles 指定的字号、颜色、对齐方式）
 *   2. 将 canvas 导出为 base64，上传到图片空间
 *   3. 返回 [{ url, width, height }] 供 updateTextImages 写入 text_N.images
 *
 * @param {Object} [options] - 上传配置
 * @param {string} [options.uploadUrl] - 图片上传接口地址
 * @param {Object} [options.extraParams] - 上传额外参数（如相册 id 等）
 * @returns {{ resolver: Function, getFailCount: Function }}
 *   - resolver: async ({ text, styles, index }) => Promise<Array<{ url, width, height }>>
 *   - getFailCount: () => number，返回合图失败的文字段数量
 */
function createTextImageResolver(options) {
  options = options || {};
  var failCount = 0;
  var uploadUrl = options.uploadUrl || '/api/upload-image';
  var extraParams = options.extraParams || {};
  var canvasWidth = 620; // MODULE_WIDTH

  var resolver = async function({ text, styles, index }) {
    if (!text) return [];

    styles = styles || {};
    var fontSize = parseInt(styles.fontSize, 10) || 14;
    var color = styles.color || '#333333';
    var textAlign = styles.textAlign || 'left';
    var paddingTop = 10;
    var paddingBottom = 10;
    var paddingLeft = 20;
    var paddingRight = 20;
    var lineHeight = Math.round(fontSize * 1.5);
    var usableWidth = canvasWidth - paddingLeft - paddingRight;

    // 用隐藏 canvas 测量文字并分行
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    ctx.font = fontSize + 'px sans-serif';

    // 将文本按 \n 分段，再按可用宽度自动换行
    var lines = [];
    var rawLines = text.split('\n');
    for (var ri = 0; ri < rawLines.length; ri++) {
      var rawLine = rawLines[ri];
      if (!rawLine) { lines.push(''); continue; }
      var currentLine = '';
      for (var ci = 0; ci < rawLine.length; ci++) {
        var testLine = currentLine + rawLine[ci];
        if (ctx.measureText(testLine).width > usableWidth && currentLine) {
          lines.push(currentLine);
          currentLine = rawLine[ci];
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
    }
    if (!lines.length) lines = [text];

    var canvasHeight = paddingTop + lines.length * lineHeight + paddingBottom;
    if (canvasHeight > 2000) canvasHeight = 2000; // 限制单张图片最大高度

    // 绘制
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.font = fontSize + 'px sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = textAlign === 'center' ? 'center'
                  : (textAlign === 'right' ? 'right' : 'left');
    var x = textAlign === 'center' ? canvasWidth / 2
          : (textAlign === 'right' ? canvasWidth - paddingRight : paddingLeft);
    var y = paddingTop + fontSize; // baseline

    var maxLines = Math.floor((canvasHeight - paddingTop - paddingBottom) / lineHeight);
    for (var li = 0; li < lines.length && li < maxLines; li++) {
      ctx.fillText(lines[li], x, y);
      y += lineHeight;
    }

    // 导出 base64
    var base64;
    try {
      base64 = canvas.toDataURL('image/jpeg', 0.9);
    } catch (e) {
      failCount++;
      return [];
    }
    canvas.width = canvas.height = 0; // 释放内存

    if (!base64 || base64 === 'data:,') {
      failCount++;
      return [];
    }

    // 上传到图片空间
    try {
      var uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(Object.assign({}, extraParams, {
          title: 'desc_text_' + (index || 1),
          img: base64
        })),
        credentials: 'include'
      });
      if (uploadRes.ok) {
        var res = await uploadRes.json();
        // 根据你的上传接口返回结构，提取图片 URL
        var picUrl = (res.result && res.result.picture && res.result.picture.picture_path)
                   || res.url || '';
        if (picUrl) {
          return [{ url: picUrl, width: canvasWidth, height: canvasHeight }];
        }
      }
    } catch (e) {}

    failCount++;
    return [];
  };

  return {
    resolver: resolver,
    getFailCount: function() { return failCount; }
  };
}
```

用法：

```javascript
var textImageHelper = createTextImageResolver({
  uploadUrl: '/api/upload-base64',  // 你的图片上传接口
  extraParams: { cid: albumId }      // 相册 id 等额外参数
});

var desc = await htmlToWirelessDesc(html, {
  textImage: textImageHelper.resolver,
  imageAspectRatio: 0.75
});

// 合图失败时的降级处理
if (textImageHelper.getFailCount() > 0) {
  console.warn(textImageHelper.getFailCount() + ' 个文字段合图失败，已自动跳过');
}
```

> **降级机制**：合图失败时 resolver 返回空数组 `[]`，`wireless-desc-converter` 会将该 `text_N` 模块整体从 `props` 中移除，不会导致提交报错。

## API 文档

### 核心方法

| 方法 | 说明 | 返回值 |
|------|------|--------|
| `htmlToWirelessDesc(html, options?)` | HTML → wirelessDesc JSON，async/await 调用 | `Promise<Object>` |
| `buildEmptyWirelessDesc(options?)` | 构造空 wirelessDesc | `Object` |
| `validateHeight(desc, maxHeight?)` | 校验总高度是否超限 | `{ valid, totalHeight, maxHeight }` |
| `serializeWirelessDesc(desc)` | 序列化为 JSON 字符串 | `string` |
| `fillEmptyValues(desc, options?)` | 遍历结构自动填充所有空值字段 | `Object`（原地修改） |

### 高度估算工具

当无法异步获取真实尺寸时，可用以下方法自动估算，避免淘宝接口报空值错误：

| 方法 | 说明 | 返回值 |
|------|------|--------|
| `estimateTextHeight(text, fontSize, width, top, bottom)` | 根据文本内容和样式估算渲染高度 | `string` |
| `estimateImageHeight(width, aspectRatio?)` | 根据宽度和宽高比估算图片高度 | `string` |

**`estimateTextHeight` 估算逻辑：**
1. `lineHeight = fontSize × 1.2`（浏览器 CJK 默认行高）
2. CJK 字符宽度 ≈ `fontSize`，ASCII 字符宽度 ≈ `fontSize × 0.5`
3. 超过可用宽度时自动换行
4. `totalHeight = totalLines × lineHeight + top + bottom`

### 模块构造

| 方法 | 说明 |
|------|------|
| `buildTextModule(params)` | 构造文字模块（`text_N`，N 从 1 开始） |
| `buildImageModule(params)` | 构造图片热区模块（`image_hot_area_N`，N 从 0 开始） |
| `buildRichTextModule(params)` | 构造富文本模块（仅保留已存在的，设 `enable=false`） |
| `buildVersionModule()` | 构造 version 模块 |
| `buildConfigModule(options?)` | 构造 config 模块 |

### 参数说明

#### `htmlToWirelessDesc(html, options)`

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `html` | `string` | — | 原始 HTML 富文本 |
| `options.maxHeight` | `string` | `'100000'` | 编辑器最大高度 |
| `options.width` | `string` | `'620'` | 模块宽度 |
| `options.splitHeight` | `string` | `'1240'` | 切图高度 |
| `options.existingModules` | `Array` | — | 已有模块（保留提交，不可丢弃） |
| `options.imageSize` | `Function` | — | 图片尺寸获取，参数 `{ url }`，返回 `Promise<{ width, height }>` |
| `options.textImage` | `Function` | — | 文字合图，参数 `{ text, styles, index }`，返回 `Promise<Array<{ url, width, height }>>` |
| `options.imageAspectRatio` | `number` | `0.75` | 图片默认宽高比（高/宽），无尺寸信息时用于估算 |

> **关于 `textImage`**：传入此函数才会生成 `text_N` 模块；不传则跳过所有文字段落，避免提交时报 `text_N.images 值不能为空` 错误。

#### `buildTextModule(params)`

| 参数 | 类型 | 说明 |
|------|------|------|
| `params.text` | `string` | 文字内容 |
| `params.images` | `Array` | 合图列表 `[{url, width, height}]` |
| `params.styles` | `Object` | 样式 `{ fontSize, color, textAlign, fontFamily, top, bottom, ... }` |
| `params.index` | `number` | 序号（`text_1`, `text_2`, ...） |

> 未传 `styles.height` 时，自动调用 `estimateTextHeight` 估算并填充。

#### `buildImageModule(params)`

| 参数 | 类型 | 说明 |
|------|------|------|
| `params.url` | `string` | 图片链接 |
| `params.width` | `number\|string` | 图片宽度 |
| `params.height` | `number\|string` | 图片高度 |
| `params.hotAreas` | `Array` | 热区列表 `[{start_x, start_y, end_x, end_y, link}]` |
| `params.index` | `number` | 序号（`image_hot_area_0`, `image_hot_area_1`, ...） |

### 常量

| 常量 | 值 | 说明 |
|------|-----|------|
| `MODULE_WIDTH` | `620` | 模块默认宽度 |
| `SPLIT_HEIGHT` | `1240` | 切图高度 |
| `MAX_HEIGHT` | `100000` | 最大总高度 |
| `VERSION` | `'1.0.0'` | 编辑器版本号 |
| `IMAGE_MIN_WIDTH` | `480` | 图片最小宽度 |
| `IMAGE_MAX_WIDTH` | `1500` | 图片最大宽度 |
| `IMAGE_MAX_HEIGHT` | `2000` | 图片最大高度 |
| `LINE_HEIGHT_RATIO` | `1.2` | 文本行高倍率（浏览器 CJK 默认 line-height） |
| `DEFAULT_IMAGE_ASPECT_RATIO` | `0.75` | 图片默认宽高比（4:3） |

## 淘宝新版图文编辑器规则提醒

1. 所有模块高度总和不超过 **100000px**（`countHeight=true` 的模块计入）
2. 已有模块不能直接删除，须设 `enable=false`
3. 官方可能新增模块，ISV 须保留提交，不可丢弃
4. 模块编号规则：`text_N` 从 **1** 开始，`image_hot_area_N` 从 **0** 开始
5. 文字模块需合成图片提交，宽度 620px，高度超过 1240px 需切图
6. 图片宽度 480~1500px，高度 ≤ 2000px
7. `textStyle.height` 不能为空，未传 `textImage` 时工具会自动跳过文字模块避免报错

## License

MIT

## 更多文档

- [实战集成指南](./docs/integration-guide.md) — 基于真实上线经验，包含文字合图解析器、图片尺寸解析器的完整实现和避坑要点
