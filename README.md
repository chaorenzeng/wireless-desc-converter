# wireless-desc-converter

淘宝新版图文编辑器 `wirelessDesc` 适配工具 —— 将 HTML 富文本转换为淘宝新版图文编辑器结构化 JSON。

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

### 需要图片尺寸 / 文字合图

```javascript
import { htmlToWirelessDesc } from 'wireless-desc-converter';

const desc = await htmlToWirelessDesc(html, {
  imageSize: async ({ url }) => {
    const res = await fetch('/api/image-size?url=' + url);
    return res.json();  // 返回 { width, height }
  },
  textImage: async ({ text, styles }) => {
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

// 单独构造文字模块
const textModule = buildTextModule({
  text: '商品描述文字',
  images: [{ url: '合图URL', width: 620, height: 62 }],
  styles: { fontSize: '28', color: '#ff0000', textAlign: 'center' },
  index: 1
});

// 单独构造图片热区模块
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

## API 文档

### 核心方法

| 方法 | 说明 | 返回值 |
|------|------|--------|
| `htmlToWirelessDesc(html, options?)` | HTML → wirelessDesc JSON，async/await 调用 | `Promise<Object>` |
| `buildEmptyWirelessDesc(options?)` | 构造空 wirelessDesc | `Object` |
| `validateHeight(desc, maxHeight?)` | 校验总高度是否超限 | `{ valid, totalHeight, maxHeight }` |
| `serializeWirelessDesc(desc)` | 序列化为 JSON 字符串 | `string` |

### 模块构造

| 方法 | 说明 |
|------|------|
| `buildTextModule(params)` | 构造文字模块 |
| `buildImageModule(params)` | 构造图片热区模块 |
| `buildRichTextModule(params)` | 构造富文本模块（仅保留已存在的，设 enable=false） |
| `buildVersionModule()` | 构造 version 模块 |
| `buildConfigModule(options?)` | 构造 config 模块 |

### 参数说明

#### `htmlToWirelessDesc(html, options)`

| 参数 | 类型 | 说明 |
|------|------|------|
| `html` | `string` | 原始 HTML 富文本 |
| `options.maxHeight` | `string` | 编辑器最大高度，默认 `'100000'` |
| `options.width` | `string` | 模块宽度，默认 `'620'` |
| `options.splitHeight` | `string` | 切图高度，默认 `'1240'` |
| `options.existingModules` | `Array` | 已有模块（保留提交） |
| `options.imageSize` | `Function` | 图片尺寸获取，参数 `{ url }`，返回 `Promise<{ width, height }>` |
| `options.textImage` | `Function` | 文字合图，参数 `{ text, styles, index }`，返回 `Promise<Array<{ url, width, height }>>` |

#### `buildTextModule(params)`

| 参数 | 类型 | 说明 |
|------|------|------|
| `params.text` | `string` | 文字内容 |
| `params.images` | `Array` | 合图列表 `[{url, width, height}]` |
| `params.styles` | `Object` | 样式 `{ fontSize, color, textAlign, fontFamily, ... }` |
| `params.id` | `string` | 模块ID（已有模块传入） |
| `params.index` | `number` | 序号 |

#### `buildImageModule(params)`

| 参数 | 类型 | 说明 |
|------|------|------|
| `params.url` | `string` | 图片链接 |
| `params.width` | `number\|string` | 图片宽度 |
| `params.height` | `number\|string` | 图片高度 |
| `params.hotAreas` | `Array` | 热区列表 `[{start_x, start_y, end_x, end_y, link}]` |
| `params.id` | `string` | 模块ID |
| `params.index` | `number` | 序号 |

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

## 淘宝新版图文编辑器规则提醒

1. 所有模块高度总和不超过 **100000px**（`countHeight=true` 的模块计入）
2. 已有模块（`id` 有值）不能直接删除，须设 `enable=false`
3. 官方可能新增模块，ISV 须保留提交，不可丢弃
4. 模块顺序由 `field.id` 后缀序号决定
5. 文字模块需合成图片提交，宽度620px，高度超过1240px需切图
6. 图片宽度 480~1500px，高度≤2000px

## License

MIT

## 更多文档

- [实战集成指南](./docs/integration-guide.md) — 基于 fe-upload-tb 项目的真实上线经验，包含文字合图解析器、图片尺寸解析器的完整实现和避坑要点
