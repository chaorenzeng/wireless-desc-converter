# 实战集成指南

本文档基于 `fe-upload-tb` 项目的真实上线经验，展示如何在淘宝商品一键上传场景中集成 `wireless-desc-converter`，重点介绍 **文字合图解析器** 和 **图片尺寸解析器** 的实现。

---

## 目录

- [整体流程](#整体流程)
- [图片尺寸解析器 createImageSizeResolver](#图片尺寸解析器-createimagesizeresolver)
- [文字合图解析器 createTextImageResolver](#文字合图解析器-createtextimageresolver)
- [提交入口集成](#提交入口集成)
- [淘宝图片空间上传接口](#淘宝图片空间上传接口)
- [关键约束与避坑](#关键约束与避坑)

---

## 整体流程

```
原始 HTML 富文本
       |
       v
htmlToWirelessDesc(html, {
  imageSize: createImageSizeResolver(),   // 补全图片宽高
  textImage: textImageHandle.resolver,     // 文字 → Canvas渲染 → 上传 → 返回图片URL
})
       |
       v
wirelessDesc JSON  ──>  /api/publish/add 提交
```

核心思路：`htmlToWirelessDesc` 负责解析 HTML 生成结构化 JSON，但有两件事需要宿主项目协助：

1. **图片尺寸** — 淘宝接口要求 `image_hot_area_N.image.height` 不能为空，但 HTML 中的 `<img>` 标签不一定带宽高属性
2. **文字合图** — 淘宝新版编辑器要求文字内容必须合成图片提交（`text_N.images` 强必填），合图需要宿主项目用 Canvas 渲染并上传到淘宝图片空间

---

## 图片尺寸解析器 createImageSizeResolver

### 职责

为 `image_hot_area_N` 模块补全图片的真实宽高。

### 解析优先级（三级降级）

```
1. window.imgs_move_res（图片搬家结果）  ── 同步，最快
       ↓ 未命中
2. loadImg 加载图片获取真实尺寸            ── 异步，准确
       ↓ 失败
3. 返回 null                              ── 由 fillEmptyValues 兜底估算
```

### 完整实现

```javascript
/**
 * 创建图片尺寸解析器，供 htmlToWirelessDesc 的 imageSize 选项使用
 *
 * @returns {Function} async resolver ({ url }) => Promise<{ width, height } | null>
 */
export function createImageSizeResolver() {
  var moveResults = getImageMoveResult(); // 从 window.imgs_move_res 读取

  return async function({ url }) {
    if (!url) return null;

    // 1. 从搬家结果中查找匹配的 pic_pixel
    for (var i = 0; i < moveResults.length; i++) {
      var item = moveResults[i] || {};
      // 匹配 pic_new（搬家后 HTML 中的 URL）或 pic_old（未搬家的原始 URL）
      if ((item.pic_new && url.indexOf(item.pic_new) === 0) ||
          (item.pic_old && url.indexOf(item.pic_old) === 0)) {
        if (item.pic_pixel) {
          var parts = item.pic_pixel.split(/[xX×]/);
          var w = parseInt(parts[0], 10);
          var h = parseInt(parts[1], 10);
          if (w > 0 && h > 0) {
            return { width: w, height: h };
          }
        }
        break; // 找到匹配但 pic_pixel 无效，跳出走 fallback
      }
    }

    // 2. 通过 loadImg 异步加载获取真实尺寸
    try {
      var imgData = await loadImg(url);
      if (imgData && !imgData.hasError && imgData.width > 1 && imgData.height > 1) {
        return { width: imgData.width, height: imgData.height };
      }
    } catch (e) {}

    // 3. 返回 null，由 fillEmptyValues 兜底
    return null;
  };
}
```

### 为什么用三级降级？

| 级别 | 来源 | 速度 | 场景 |
|------|------|------|------|
| 1 | 图片搬家结果 `pic_pixel` | 同步，O(1) 查找 | 用户已执行过图片搬家（常见路径） |
| 2 | `new Image()` 加载 | 异步，需网络请求 | 搬家结果未命中或未搬家 |
| 3 | `null` → 估算 | 即时 | 网络失败或跨域，由 `fillEmptyValues` 按宽高比估算 |

---

## 文字合图解析器 createTextImageResolver

### 职责

淘宝新版编辑器要求文字段落必须以**图片形式**提交（`text_N.images` 强必填，不允许空数组）。此解析器负责：

1. 用 Canvas 将文字渲染成图片
2. 导出 base64
3. 上传到淘宝图片空间
4. 返回 `[{ url, width, height }]`

### 关键约束

- 图片宽度固定 **620px**（MODULE_WIDTH）
- 图片高度根据文本内容自动计算，上限 **2000px**
- 字体使用系统默认 `sans-serif`（Canvas 不支持加载 web font）
- 上传失败 / 返回空数组 / 抛异常 → `wireless-desc-converter` 将该 `text_N` 模块**整体从 props 移除**

### 完整实现

```javascript
/**
 * 创建文字合图解析器
 *
 * @param {Object} [uploaderOptions]
 * @param {string|number} [uploaderOptions.cid=0] - 淘宝图片空间相册 id
 * @returns {{ resolver: Function, getFailCount: Function }}
 */
export function createTextImageResolver(uploaderOptions) {
  uploaderOptions = uploaderOptions || {};
  var failCount = 0;

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
    var canvasWidth = 620; // MODULE_WIDTH
    var lineHeight = Math.round(fontSize * 1.5);
    var usableWidth = canvasWidth - paddingLeft - paddingRight;

    // --- 第一步：用隐藏 canvas 测量文字并分行 ---
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    ctx.font = fontSize + 'px sans-serif';

    var lines = [];
    var rawLines = text.split('\n');
    for (var ri = 0; ri < rawLines.length; ri++) {
      var rawLine = rawLines[ri];
      if (!rawLine) { lines.push(''); continue; }
      // 逐字符测量，超过可用宽度则换行
      var currentLine = '';
      for (var ci = 0; ci < rawLine.length; ci++) {
        var testLine = currentLine + rawLine[ci];
        var measured = ctx.measureText(testLine).width;
        if (measured > usableWidth && currentLine) {
          lines.push(currentLine);
          currentLine = rawLine[ci];
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
    }

    if (!lines.length) lines = [text];

    // --- 第二步：计算画布高度并绘制 ---
    var canvasHeight = paddingTop + lines.length * lineHeight + paddingBottom;
    if (canvasHeight > 2000) canvasHeight = 2000; // 限制最大高度

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

    // --- 第三步：导出 base64 ---
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

    // --- 第四步：上传到淘宝图片空间 ---
    try {
      var { pathUploadBase64 } = getImageUploadApiPath();
      var gid = window.GOOD_ID || (window.zwd_data && window.zwd_data.gid) || '';
      var zdid = (window.zwd_data && window.zwd_data.zdid) || '';
      var title = gid + '_' + zdid + '_描述文字_' + (index || 1);

      var uploadRes = await fetch(pathUploadBase64, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({
          cid: uploaderOptions.cid || 0,       // 相册 id
          title: title,                        // 图片标题（命名规则与主图/属性图统一）
          img: base64,                         // base64 图片数据
          gid: gid,                            // 商品 id
          item_no: (window.zwd_data && window.zwd_data.item_no) || '',
          createCategoryForGoods: getAutoCreateFolderOrNot(), // 是否自动创建商品图片文件夹
        }),
        credentials: 'include',
      });

      if (uploadRes.ok) {
        var res = await uploadRes.json();
        if (res && res.is_success && res.result && res.result.picture) {
          var picUrl = res.result.picture.picture_path;
          if (picUrl) {
            return [{ url: picUrl, width: canvasWidth, height: canvasHeight }];
          }
        }
      }
    } catch (e) {
      console.log('---> createTextImageResolver: upload failed', e);
    }

    failCount++;
    return [];
  };

  return {
    resolver: resolver,
    getFailCount: function() { return failCount; }
  };
}
```

### 返回值结构

```javascript
{
  resolver: Function,    // 传给 htmlToWirelessDesc 的 textImage 选项
  getFailCount: Function // 返回本次合图失败的文字段数量（用于弹窗提示）
}
```

---

## 提交入口集成

以下是 `fe-upload-tb` 中 `UploadBtn/index.js` 的真实集成代码：

```javascript
import {
  createImageSizeResolver,
  createTextImageResolver,
  htmlToWirelessDesc,
  isWirelessDescUser,
} from '../../../util';

// 在提交方法中：
async submitData() {
  // ... 前置处理 ...

  let descField = {};
  if (isWirelessDescUser()) {
    // 1. 创建文字合图解析器（传入相册 id）
    const textImageHandle = createTextImageResolver({
      cid: (this.props.goods.album || {}).id || 0
    });

    // 2. 调用 htmlToWirelessDesc，同时传入两个解析器
    const wirelessDesc = await this.buildWirelessDesc(html, {
      imageSize: createImageSizeResolver(),
      textImage: textImageHandle.resolver,
    });

    // 3. 检查合图失败数量，弹窗询问用户是否继续
    const textFailCount = textImageHandle.getFailCount();
    if (textFailCount > 0) {
      const confirmed = await new Promise(function(resolve) {
        Confirm.open(
          '文字合图失败',
          textFailCount + ' 段文字内容合图失败，这些段落将不会显示在商品详情中。是否继续上传？',
          function() { resolve(true); },
          function() { resolve(false); }
        );
      });
      if (!confirmed) {
        this.setState({ loading: false });
        return; // 用户取消，中止提交
      }
    }

    descField = { wirelessDesc: wirelessDesc };
  } else {
    // 旧版用户仍用 desc 字段
    descField = { desc: html };
  }

  // 4. 构建 submitData 并提交
  const submitData = {
    // ... 其他字段 ...
    ...descField,
  };

  // HTTPUtil.post('/api/publish/add', submitData)
}
```

### 合图失败的处理策略

```
合图失败 / 返回空数组 / 抛异常
       |
       v
wireless-desc-converter: 将该 text_N 模块整体从 props 移除
       |
       v
宿主项目: getFailCount() > 0 时弹窗提示用户
       |
       ├── 用户确认继续 → 正常提交（失败的文字段不会出现在详情中）
       └── 用户取消     → 中止提交，loading 关闭
```

> **为什么整体移除而不是传空数组？** 淘宝官方确认 `text_N.images` 为强必填字段，空数组和字段缺失均会报错，唯一合法的降级方式是移除整个 `text_N` 模块。

---

## 淘宝图片空间上传接口

文字合图最终需要上传到淘宝图片空间，接口参数如下：

### 请求参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `cid` | `string\|number` | 相册 ID（从 `album.id` 获取） |
| `title` | `string` | 图片标题，建议格式：`{gid}_{zdid}_描述文字_{index}` |
| `img` | `string` | base64 图片数据（`data:image/jpeg;base64,...`） |
| `gid` | `string` | 商品 ID |
| `item_no` | `string` | 商品编号 |
| `createCategoryForGoods` | `boolean` | 是否自动创建商品图片文件夹（幂等，重复传不会报错） |

### 响应结构

```json
{
  "is_success": true,
  "result": {
    "picture": {
      "picture_path": "//img.alicdn.com/imgextra/xxx.jpg"
    }
  }
}
```

### 接口版本选择

淘宝图片空间有新版（v3）和旧版两套接口，通过 `getImageUploadApiPath()` 统一管理：

```javascript
function getImageUploadApiPath() {
  const useNewApi = checkUseNewImageUploadApi(); // 根据 api_version >= 3 判断
  return {
    pathUploadBase64: useNewApi ? UPLOAD_IMAGE_V3 : UPLOAD_IMAGE,
    pathUploadFile:   useNewApi ? UPLOAD_FILE_V3   : UPLOAD_FILE,
    pathGetBase64:    useNewApi ? GET_IMAGE_BASE64_V3 : GET_IMAGE_BASE64,
  };
}
```

---

## 关键约束与避坑

### 1. 模块编号规则

| 模块类型 | 编号起始 | 示例 |
|----------|----------|------|
| `text_N` | **1** | `text_1`, `text_2`, ... |
| `image_hot_area_N` | **0** | `image_hot_area_0`, `image_hot_area_1`, ... |

> 错误的编号会导致淘宝接口报 `id 为只读字段` 错误。

### 2. `id` 字段（groupId）

经最终实测确认 **不需要传** `inputField('id', groupId)`。淘宝接口会自动分配，手动传会导致 `image_hot_area_N.id 为只读字段，不可编辑` 报错。

### 3. `sample` 字段

`text_N` 和 `image_hot_area_N` 的 `sample`（示意图）字段均为**可选**，不传不会报错。`fe-upload-tb` 的实现中 `text_N` 不生成 `sample`。

### 4. `text_N.images` 强必填

- 有 `textImage` 合图函数 → 生成 `text_N` 模块，`images` 为合图结果
- 无 `textImage` 合图函数 → **跳过文字模块**，不生成 `text_N`
- 合图失败 → 整体移除该 `text_N` 模块

### 5. 循环依赖规避

如果宿主项目的工具方法存在循环依赖（如 `image.js` → `HTTPUtil` → `index.js` → `image.js`），文字合图上传应**直接用原生 `fetch`**，不要通过封装的 HTTP 工具类。

### 6. Canvas 限制

- Canvas 不支持加载 web font，只能用系统字体渲染
- IE8 不支持 Canvas，需确保 `isWirelessDescUser()` 在 IE8 环境返回 `false`
- `canvas.toDataURL` 在某些跨域场景会抛异常，需 try-catch

### 7. 图片尺寸约束

| 约束 | 值 |
|------|-----|
| 图片最小宽度 | 480px |
| 图片最大宽度 | 1500px |
| 图片最大高度 | 2000px |
| 所有模块总高度上限 | 100000px |
| 模块默认宽度 | 620px |
| 切图高度 | 1240px |
