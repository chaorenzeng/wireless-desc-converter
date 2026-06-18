/**
 * 淘宝新版图文编辑器 wirelessDesc 适配模块
 *
 * 独立 npm 包入口，核心逻辑复用项目 src/util/wirelessDesc.js
 * 此文件为零依赖版本，可直接在任何 JS 环境使用
 *
 * API 设计：
 *   - htmlToWirelessDesc(html, options?)  异步，统一用 async/await 调用
 *   - 不需要异步补全时，不传 resolvers 即可，仍然 await
 *
 * @module wireless-desc-converter
 */

// ==================== 常量定义 ====================

var MODULE_WIDTH = 620;
var SPLIT_HEIGHT = 1240;
var MAX_HEIGHT = 100000;
var VERSION = '1.0.0';

var IMAGE_MIN_WIDTH = 480;
var IMAGE_MAX_WIDTH = 1500;
var IMAGE_MAX_HEIGHT = 2000;

// 文本行高倍率（浏览器 CJK 默认 line-height ≈ 1.2）
var LINE_HEIGHT_RATIO = 1.2;

// 图片默认宽高比（4:3，电商详情页常见比例）
var DEFAULT_IMAGE_ASPECT_RATIO = 0.75;

// ==================== 内部工具方法 ====================

function generateGroupId() {
  return 'group' + Date.now() + Math.floor(Math.random() * 10000);
}

function inputField(id, value) {
  var field = { id: id, type: 'input' };
  if (value !== undefined && value !== null) {
    field.value = { value: String(value) };
  }
  return field;
}

function singleCheckField(id, value) {
  return {
    id: id,
    type: 'singleCheck',
    value: { value: String(value) }
  };
}

function extractImages(html) {
  var imgReg = /<img[^>]*?(?:>)/gi;
  var srcReg = /src\s*=\s*['"]?([^'"\s>]*)['"\s>]?/i;
  var results = [];
  var match;
  while ((match = imgReg.exec(html)) !== null) {
    var srcMatch = match[0].match(srcReg);
    if (srcMatch && srcMatch[1]) {
      results.push({ url: srcMatch[1], html: match[0] });
    }
  }
  return results;
}

function extractText(html) {
  return html
    .replace(/<img[^>]*?(?:>)/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<.+?>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// CSS 关键字字号 → px 值映射（基于浏览器默认 16px 基准）
var CSS_FONT_SIZE_KEYWORDS = {
  'xx-small': '9',
  'x-small': '10',
  'small': '13',
  'medium': '16',
  'large': '18',
  'x-large': '24',
  'xx-large': '32',
  'smaller': '13',
  'larger': '19'
};

function extractStyles(html) {
  var styles = {};
  // 遍历所有 style= 属性，合并样式（后出现的覆盖先出现的）
  var styleGlobalReg = /style\s*=\s*['"]([^'"]*)['"]/gi;
  var styleMatch;
  while ((styleMatch = styleGlobalReg.exec(html)) !== null) {
    var styleStr = styleMatch[1];
    var colorMatch = styleStr.match(/(?:^|[^-])color\s*:\s*([^;]+)/i);
    if (colorMatch) styles.color = colorMatch[1].trim();
    var fontSizeMatch = styleStr.match(/font-size\s*:\s*([^;]+)/i);
    if (fontSizeMatch) {
      var fontSizeValue = fontSizeMatch[1].trim().toLowerCase();
      // 先尝试 CSS 关键字映射
      if (CSS_FONT_SIZE_KEYWORDS[fontSizeValue]) {
        styles.fontSize = CSS_FONT_SIZE_KEYWORDS[fontSizeValue];
      } else {
        var pxVal = parseInt(fontSizeValue.replace(/px/i, ''), 10);
        if (!isNaN(pxVal)) {
          styles.fontSize = mapFontSize(pxVal);
        }
      }
    }
    var alignMatch = styleStr.match(/text-align\s*:\s*([^;]+)/i);
    if (alignMatch) styles.textAlign = alignMatch[1].trim();
    var fontMatch = styleStr.match(/font-family\s*:\s*([^;]+)/i);
    if (fontMatch) styles.fontFamily = fontMatch[1].trim();
  }
  var headingReg = /<h(\d)[^>]*>/i;
  var headingMatch = html.match(headingReg);
  if (headingMatch && !styles.fontSize) {
    styles.fontSize = mapHeadingSize(parseInt(headingMatch[1], 10));
  }
  if (!styles.textAlign) {
    if (/<center/i.test(html) || /align\s*=\s*['"]center['"]/i.test(html)) {
      styles.textAlign = 'center';
    } else if (/align\s*=\s*['"]right['"]/i.test(html)) {
      styles.textAlign = 'right';
    }
  }
  return styles;
}

function mapFontSize(size) {
  var allowed = [12, 14, 16, 18, 20, 22, 24, 28, 30, 32, 36, 40, 44, 48, 52, 56, 60];
  var closest = allowed[0];
  var minDiff = Math.abs(size - allowed[0]);
  for (var i = 1; i < allowed.length; i++) {
    var diff = Math.abs(size - allowed[i]);
    if (diff < minDiff) { minDiff = diff; closest = allowed[i]; }
  }
  return String(closest);
}

function mapHeadingSize(level) {
  var map = { 1: '28', 2: '24', 3: '20', 4: '18', 5: '16', 6: '14' };
  return map[level] || '14';
}

function parseHtmlSegments(html) {
  var segments = [];
  var imgReg = /<img[^>]*?(?:>)/gi;
  var parts = html.split(imgReg);
  var images = extractImages(html);
  for (var i = 0; i < parts.length; i++) {
    var textContent = extractText(parts[i]);
    var styles = extractStyles(parts[i]);
    if (textContent) {
      segments.push({ type: 'text', content: textContent, styles: styles });
    }
    if (i < images.length) {
      segments.push({ type: 'image', url: images[i].url });
    }
  }
  return segments;
}

/**
 * 根据文本内容、字号、宽度估算渲染高度
 *
 * 淘宝图文编辑器要求 textStyle.height 不能为空，
 * 当未传 textImage 解析器时，需用此函数自动估算高度。
 *
 * 估算逻辑：
 *   1. lineHeight = fontSize × LINE_HEIGHT_RATIO (1.2)
 *   2. CJK 字符宽度 ≈ fontSize，ASCII 字符宽度 ≈ fontSize × 0.5
 *   3. 每行文本超过可用宽度时自动换行
 *   4. totalHeight = totalLines × lineHeight + top + bottom
 *
 * @param {string} text - 文本内容（含换行符 \n）
 * @param {string|number} fontSize - 字号（px 值）
 * @param {string|number} width - 文本区域宽度
 * @param {string|number} top - 上内边距
 * @param {string|number} bottom - 下内边距
 * @returns {string} 估算高度值（整数字符串）
 */
function estimateTextHeight(text, fontSize, width, top, bottom) {
  if (!text) return '0';
  fontSize = parseInt(fontSize, 10) || 14;
  width = parseInt(width, 10) || MODULE_WIDTH;
  top = parseInt(top, 10) || 10;
  bottom = parseInt(bottom, 10) || 10;

  var lineHeight = Math.round(fontSize * LINE_HEIGHT_RATIO);

  // 拆分文本行（换行符分段）
  var lines = text.split('\n');
  var totalLines = 0;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line) {
      // 空行仍占一行高度
      totalLines += 1;
      continue;
    }
    // 估算该行文本的像素宽度
    var lineWidthPx = 0;
    for (var c = 0; c < line.length; c++) {
      var ch = line.charCodeAt(c);
      if (ch > 127) {
        // CJK 及全角字符，宽度约等于 fontSize
        lineWidthPx += fontSize;
      } else {
        // ASCII 及半角字符，宽度约为 fontSize 的一半
        lineWidthPx += fontSize * 0.5;
      }
    }
    // 换行数 = ceil(lineWidthPx / width)，至少 1 行
    var wrappedLines = Math.max(1, Math.ceil(lineWidthPx / width));
    totalLines += wrappedLines;
  }

  var height = totalLines * lineHeight + top + bottom;
  return String(height);
}

/**
 * 根据宽度估算图片高度
 *
 * 当无法异步获取图片真实尺寸时，用默认宽高比估算。
 * 电商详情页图片常见比例为 4:3（高/宽 ≈ 0.75），
 * 也可传入自定义宽高比。
 *
 * @param {string|number} width - 图片宽度（px）
 * @param {number} [aspectRatio] - 高/宽比，默认 0.75
 * @returns {string} 估算高度值（整数字符串）
 */
function estimateImageHeight(width, aspectRatio) {
  width = parseInt(width, 10) || MODULE_WIDTH;
  aspectRatio = aspectRatio || DEFAULT_IMAGE_ASPECT_RATIO;
  var height = Math.round(width * aspectRatio);
  // 确保不超过淘宝限制
  if (height > IMAGE_MAX_HEIGHT) height = IMAGE_MAX_HEIGHT;
  return String(height);
}

/**
 * 遍历 wirelessDesc 结构，自动填充所有空值字段
 *
 * 扫描所有模块中的图片高度、文字高度、sample 高度等，
 * 当值为空时用估算值自动填充，确保提交淘宝接口不报空值错误。
 *
 * @param {Object} wirelessDesc - wirelessDesc 结构化 JSON
 * @param {Object} [options] - 配置选项
 * @param {number} [options.imageAspectRatio] - 图片默认宽高比（高/宽）
 * @returns {Object} 填充后的 wirelessDesc（原地修改）
 */
function fillEmptyValues(wirelessDesc, options) {
  options = options || {};
  var aspectRatio = options.imageAspectRatio || DEFAULT_IMAGE_ASPECT_RATIO;

  if (!wirelessDesc || !wirelessDesc.value || !wirelessDesc.value.props) {
    return wirelessDesc;
  }

  var props = wirelessDesc.value.props;
  for (var i = 0; i < props.length; i++) {
    var module = props[i];
    if (module.type !== 'complex' || !module.value || !module.value.props) continue;
    var moduleProps = module.value.props;
    var moduleId = module.id || '';

    // 遍历模块内所有字段
    for (var j = 0; j < moduleProps.length; j++) {
      var field = moduleProps[j];

      // 处理 image 类型字段（图片模块中的 image 子对象）
      if (field.id === 'image' && field.value && field.value.props) {
        var imgProps = field.value.props;
        var imgWidth = MODULE_WIDTH;
        var imgHasHeight = false;
        for (var k = 0; k < imgProps.length; k++) {
          if (imgProps[k].id === 'width' && imgProps[k].value) {
            imgWidth = parseInt(imgProps[k].value.value, 10) || MODULE_WIDTH;
          }
          if (imgProps[k].id === 'height') {
            imgHasHeight = true;
            if (!imgProps[k].value || !imgProps[k].value.value || imgProps[k].value.value === '') {
              imgProps[k] = inputField('height', estimateImageHeight(imgWidth, aspectRatio));
            }
          }
        }
        // 如果没有 height 字段，补一个
        if (!imgHasHeight) {
          imgProps.push(inputField('height', estimateImageHeight(imgWidth, aspectRatio)));
        }
      }

      // 处理 images 类型字段（文字模块中的多图）
      if (field.id === 'images' && field.values) {
        for (var m = 0; m < field.values.length; m++) {
          var imgValues = field.values[m].props;
          var mvWidth = MODULE_WIDTH;
          var mvHasHeight = false;
          for (var n = 0; n < imgValues.length; n++) {
            if (imgValues[n].id === 'width' && imgValues[n].value) {
              mvWidth = parseInt(imgValues[n].value.value, 10) || MODULE_WIDTH;
            }
            if (imgValues[n].id === 'height') {
              mvHasHeight = true;
              if (!imgValues[n].value || !imgValues[n].value.value || imgValues[n].value.value === '') {
                imgValues[n] = inputField('height', estimateImageHeight(mvWidth, aspectRatio));
              }
            }
          }
          if (!mvHasHeight) {
            imgValues.push(inputField('height', estimateImageHeight(mvWidth, aspectRatio)));
          }
        }
      }

      // 处理 sample 类型字段
      if (field.id === 'sample' && field.values) {
        for (var s = 0; s < field.values.length; s++) {
          var sampleProps = field.values[s].props;
          var sampleWidth = MODULE_WIDTH;
          var sampleHasHeight = false;
          for (var sp = 0; sp < sampleProps.length; sp++) {
            if (sampleProps[sp].id === 'width' && sampleProps[sp].value) {
              sampleWidth = parseInt(sampleProps[sp].value.value, 10) || MODULE_WIDTH;
            }
            if (sampleProps[sp].id === 'height') {
              sampleHasHeight = true;
              if (!sampleProps[sp].value || !sampleProps[sp].value.value || sampleProps[sp].value.value === '') {
                sampleProps[sp] = inputField('height', estimateImageHeight(sampleWidth, aspectRatio));
              }
            }
          }
          if (!sampleHasHeight) {
            sampleProps.push(inputField('height', estimateImageHeight(sampleWidth, aspectRatio)));
          }
        }
      }

      // 处理 textStyle 中的 height（文字模块）
      if (field.id === 'textStyle' && field.value && field.value.props) {
        var styleProps = field.value.props;
        var tsText = '';
        var tsFontSize = '14';
        var tsWidth = MODULE_WIDTH;
        var tsTop = '10';
        var tsBottom = '10';
        var tsHasHeight = false;
        // 先收集其他样式值
        for (var ts = 0; ts < styleProps.length; ts++) {
          if (styleProps[ts].id === 'value' && styleProps[ts].value) tsText = styleProps[ts].value.value;
          if (styleProps[ts].id === 'fontSize' && styleProps[ts].value) tsFontSize = styleProps[ts].value.value;
          if (styleProps[ts].id === 'width' && styleProps[ts].value) tsWidth = styleProps[ts].value.value;
          if (styleProps[ts].id === 'top' && styleProps[ts].value) tsTop = styleProps[ts].value.value;
          if (styleProps[ts].id === 'bottom' && styleProps[ts].value) tsBottom = styleProps[ts].value.value;
        }
        // 再填充 height
        for (var ts2 = 0; ts2 < styleProps.length; ts2++) {
          if (styleProps[ts2].id === 'height') {
            tsHasHeight = true;
            if (!styleProps[ts2].value || !styleProps[ts2].value.value || styleProps[ts2].value.value === '') {
              styleProps[ts2] = inputField('height', estimateTextHeight(tsText, tsFontSize, tsWidth, tsTop, tsBottom));
            }
          }
        }
        if (!tsHasHeight) {
          styleProps.push(inputField('height', estimateTextHeight(tsText, tsFontSize, tsWidth, tsTop, tsBottom)));
        }
      }

      // 处理 html 类型字段（richText 模块）
      if (field.id === 'html' && field.value && field.value.props) {
        var htmlProps = field.value.props;
        var htmlHasWidth = false;
        var htmlHasHeight = false;
        for (var hp = 0; hp < htmlProps.length; hp++) {
          if (htmlProps[hp].id === 'width') {
            htmlHasWidth = true;
            if (!htmlProps[hp].value || !htmlProps[hp].value.value || htmlProps[hp].value.value === '') {
              htmlProps[hp] = inputField('width', MODULE_WIDTH);
            }
          }
          if (htmlProps[hp].id === 'height') {
            htmlHasHeight = true;
            if (!htmlProps[hp].value || !htmlProps[hp].value.value || htmlProps[hp].value.value === '') {
              htmlProps[hp] = inputField('height', estimateImageHeight(MODULE_WIDTH, aspectRatio));
            }
          }
        }
        if (!htmlHasWidth) htmlProps.push(inputField('width', MODULE_WIDTH));
        if (!htmlHasHeight) htmlProps.push(inputField('height', estimateImageHeight(MODULE_WIDTH, aspectRatio)));
      }
    }
  }

  return wirelessDesc;
}

// ==================== 模块构造方法 ====================

function buildVersionModule() {
  return inputField('version', VERSION);
}

function buildConfigModule(options) {
  options = options || {};
  return {
    id: 'config', type: 'complex',
    value: {
      props: [
        inputField('maxHeight', options.maxHeight || MAX_HEIGHT),
        inputField('width', options.width || MODULE_WIDTH),
        inputField('splitHeight', options.splitHeight || SPLIT_HEIGHT)
      ]
    }
  };
}

function buildTextModule(params) {
  params = params || {};
  var text = params.text || '';
  var images = params.images || [];
  var styles = params.styles || {};
  var groupId = params.id || generateGroupId();
  var index = params.index !== undefined ? params.index : 1;
  var fieldId = 'text_' + index;

  var imageValues = [];
  for (var i = 0; i < images.length; i++) {
    imageValues.push({
      props: [
        inputField('width', images[i].width || MODULE_WIDTH),
        inputField('url', images[i].url || ''),
        inputField('height', images[i].height || '')
      ]
    });
  }

  var sampleValues = [];
  if (images.length > 0) {
    sampleValues.push({
      props: [inputField('width'), inputField('url', images[0].url || ''), inputField('height')]
    });
  }

  // 当未传入显式 height 时，根据文本内容自动估算
  // 淘宝接口要求 textStyle.height 不能为空
  var textHeight = styles.height;
  if (!textHeight) {
    textHeight = estimateTextHeight(
      text,
      styles.fontSize || '14',
      styles.width || MODULE_WIDTH,
      styles.top || '10',
      styles.bottom || '10'
    );
  }

  var textStyleProps = [
    singleCheckField('fontFamily', styles.fontFamily || 'ali-webfont'),
    inputField('color', styles.color || '#333333'),
    inputField('top', styles.top || '10'),
    singleCheckField('textAlign', styles.textAlign || 'left'),
    inputField('left', styles.left || '0'),
    inputField('bottom', styles.bottom || '10'),
    inputField('width', styles.width || MODULE_WIDTH),
    singleCheckField('fontSize', styles.fontSize || '14'),
    inputField('right', styles.right || '0'),
    inputField('value', text),
    inputField('height', textHeight)
  ];

  return {
    id: fieldId, type: 'complex',
    value: {
      props: [
        { id: 'images', type: 'multiComplex', values: imageValues },
        singleCheckField('enable', 'true'),
        singleCheckField('countHeight', 'false'),
        inputField('id', groupId),
        { id: 'textStyle', type: 'complex', value: { props: textStyleProps } },
        { id: 'sample', type: 'multiComplex', values: sampleValues }
      ]
    }
  };
}

function buildImageModule(params) {
  params = params || {};
  var url = params.url || '';
  var width = params.width || MODULE_WIDTH;
  var height = params.height || '';
  var hotAreas = params.hotAreas || [];
  var groupId = params.id || generateGroupId();
  var index = params.index !== undefined ? params.index : 0;
  var fieldId = 'image_hot_area_' + index;

  var hotAreaValues = [];
  for (var i = 0; i < hotAreas.length; i++) {
    hotAreaValues.push({
      props: [
        inputField('start_x', hotAreas[i].start_x),
        inputField('start_y', hotAreas[i].start_y),
        inputField('end_x', hotAreas[i].end_x),
        inputField('end_y', hotAreas[i].end_y),
        inputField('link', hotAreas[i].link || '')
      ]
    });
  }

  var sampleValues = [];
  if (url) {
    sampleValues.push({
      props: [inputField('width', width), inputField('url', url), inputField('height', height)]
    });
  }

  return {
    id: fieldId, type: 'complex',
    value: {
      props: [
        { id: 'image', type: 'complex', value: {
          props: [inputField('width', width), inputField('url', url), inputField('height', height)]
        }},
        singleCheckField('enable', 'true'),
        singleCheckField('countHeight', 'true'),
        { id: 'hot_area', type: 'multiComplex', values: hotAreaValues },
        inputField('id', groupId),
        { id: 'sample', type: 'multiComplex', values: sampleValues }
      ]
    }
  };
}

function buildRichTextModule(params) {
  params = params || {};
  var groupId = params.id || generateGroupId();
  var index = params.index !== undefined ? params.index : 0;
  var fieldId = 'rich_text_' + index;
  return {
    id: fieldId, type: 'complex',
    value: {
      props: [
        singleCheckField('enable', 'false'),
        singleCheckField('countHeight', 'false'),
        inputField('id', groupId),
        { id: 'html', type: 'complex', value: {
          props: [inputField('text', params.html || ''), inputField('width', ''), inputField('height', '')]
        }},
        { id: 'sample', type: 'multiComplex', values: [] }
      ]
    }
  };
}

// ==================== 内部更新方法 ====================

function updateTextImages(textModule, images) {
  var imageValues = [];
  // 合图总高度，用于更新 textStyle.height
  var totalImageHeight = 0;
  for (var k = 0; k < images.length; k++) {
    var imgH = parseInt(images[k].height, 10) || 0;
    totalImageHeight += imgH;
    imageValues.push({
      props: [
        inputField('width', images[k].width || MODULE_WIDTH),
        inputField('url', images[k].url || ''),
        inputField('height', images[k].height || '')
      ]
    });
  }
  var moduleProps = textModule.value.props;
  for (var p = 0; p < moduleProps.length; p++) {
    if (moduleProps[p].id === 'images') moduleProps[p].values = imageValues;
    if (moduleProps[p].id === 'sample' && images.length > 0) {
      moduleProps[p].values = [{
        props: [inputField('width'), inputField('url', images[0].url || ''), inputField('height')]
      }];
    }
    // 合图完成后，用合图总高度更新 textStyle.height
    if (moduleProps[p].id === 'textStyle' && moduleProps[p].value && moduleProps[p].value.props && totalImageHeight > 0) {
      var styleProps = moduleProps[p].value.props;
      for (var sp = 0; sp < styleProps.length; sp++) {
        if (styleProps[sp].id === 'height') {
          // 合图高度 + top + bottom padding
          var topVal = 10;
          var bottomVal = 10;
          for (var tp = 0; tp < styleProps.length; tp++) {
            if (styleProps[tp].id === 'top' && styleProps[tp].value) topVal = parseInt(styleProps[tp].value.value, 10) || 10;
            if (styleProps[tp].id === 'bottom' && styleProps[tp].value) bottomVal = parseInt(styleProps[tp].value.value, 10) || 10;
          }
          styleProps[sp] = inputField('height', String(totalImageHeight + topVal + bottomVal));
        }
      }
    }
  }
}

function updateImageSize(imageModule, size) {
  var scaledWidth = MODULE_WIDTH;
  var scaledHeight = '';
  if (size.width && size.height) {
    var ratio = MODULE_WIDTH / size.width;
    scaledWidth = MODULE_WIDTH;
    scaledHeight = Math.round(size.height * ratio);
    if (scaledWidth < IMAGE_MIN_WIDTH) scaledWidth = IMAGE_MIN_WIDTH;
    if (scaledWidth > IMAGE_MAX_WIDTH) scaledWidth = IMAGE_MAX_WIDTH;
    if (scaledHeight > IMAGE_MAX_HEIGHT) scaledHeight = IMAGE_MAX_HEIGHT;
  }
  var moduleProps = imageModule.value.props;
  for (var ip = 0; ip < moduleProps.length; ip++) {
    if (moduleProps[ip].id === 'image' && moduleProps[ip].value && moduleProps[ip].value.props) {
      var imageProps = moduleProps[ip].value.props;
      for (var j = 0; j < imageProps.length; j++) {
        if (imageProps[j].id === 'width') imageProps[j] = inputField('width', scaledWidth);
        else if (imageProps[j].id === 'height') imageProps[j] = inputField('height', scaledHeight);
      }
    }
    if (moduleProps[ip].id === 'sample' && moduleProps[ip].values && moduleProps[ip].values.length) {
      var sampleProps = moduleProps[ip].values[0].props;
      for (var sp = 0; sp < sampleProps.length; sp++) {
        if (sampleProps[sp].id === 'width') sampleProps[sp] = inputField('width', scaledWidth);
        else if (sampleProps[sp].id === 'height') sampleProps[sp] = inputField('height', scaledHeight);
      }
    }
  }
}

// ==================== 核心转换方法 ====================

/**
 * 将 HTML 富文本转换为淘宝新版图文编辑器 wirelessDesc 结构
 *
 * 异步方法，统一用 async/await 调用。
 * 不需要异步补全（图片尺寸、文字合图）时，不传 resolvers 即可。
 *
 * @param {string} html - 原始 HTML 富文本
 * @param {Object} [options] - 配置选项
 * @param {string} [options.maxHeight=100000] - 编辑器最大高度
 * @param {string} [options.width=620] - 编辑器模块宽度
 * @param {string} [options.splitHeight=1240] - 切图高度
 * @param {Array} [options.existingModules] - 已存在的模块
 * @param {Function} [options.imageSize] - 图片尺寸获取函数
 *   参数: { url } 返回 Promise<{ width, height }>
 * @param {Function} [options.textImage] - 文字合图函数
 *   参数: { text, styles, index } 返回 Promise<Array<{ url, width, height }>>
 * @param {number} [options.imageAspectRatio=0.75] - 图片默认宽高比（高/宽），用于无尺寸信息时估算
 * @returns {Promise<Object>} wirelessDesc 结构化 JSON
 *
 * @example
 * // 最简用法
 * const desc = await htmlToWirelessDesc(html);
 * const jsonStr = JSON.stringify(desc);
 *
 * @example
 * // 需要异步补全
 * const desc = await htmlToWirelessDesc(html, {
 *   imageSize: async ({ url }) => getImageSize(url),
 *   textImage: async ({ text, styles }) => renderText(text, styles)
 * });
 */
async function htmlToWirelessDesc(html, options) {
  options = options || {};

  if (!html || typeof html !== 'string') {
    return buildEmptyWirelessDesc(options);
  }

  var segments = parseHtmlSegments(html);
  var textCounter = 0;
  var imageCounter = 0;
  var props = [];

  if (options.existingModules && options.existingModules.length) {
    for (var e = 0; e < options.existingModules.length; e++) {
      props.push(options.existingModules[e]);
    }
  }

  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    if (seg.type === 'text') {
      textCounter++;
      props.push(buildTextModule({ text: seg.content, styles: seg.styles, index: textCounter }));
    } else if (seg.type === 'image') {
      imageCounter++;
      props.push(buildImageModule({ url: seg.url, width: MODULE_WIDTH, height: '', index: imageCounter }));
    }
  }

  props.push(buildVersionModule());
  props.push(buildConfigModule(options));

  var wirelessDesc = {
    id: 'wirelessDesc', name: '旺铺无线详情描述', type: 'complex',
    value: { props: props }
  };

  // 异步补全：图片尺寸 & 文字合图
  var hasImageResolver = typeof options.imageSize === 'function';
  var hasTextResolver = typeof options.textImage === 'function';

  if (hasImageResolver || hasTextResolver) {
    var tasks = [];

    for (var j = 0; j < props.length; j++) {
      var module = props[j];
      if (module.type !== 'complex' || !module.value || !module.value.props) continue;
      var moduleId = module.id || '';

      // 文字模块 → 调用 textImage
      if (hasTextResolver && moduleId.indexOf('text_') === 0) {
        var textStyle = null;
        var moduleProps = module.value.props;
        for (var p = 0; p < moduleProps.length; p++) {
          if (moduleProps[p].id === 'textStyle') { textStyle = moduleProps[p]; break; }
        }
        if (textStyle && textStyle.value && textStyle.value.props) {
          var textValue = '';
          var styles = {};
          var styleProps = textStyle.value.props;
          for (var s = 0; s < styleProps.length; s++) {
            var sp = styleProps[s];
            if (!sp.value || !sp.value.value) continue;
            if (sp.id === 'value') textValue = sp.value.value;
            else if (sp.id === 'fontFamily') styles.fontFamily = sp.value.value;
            else if (sp.id === 'color') styles.color = sp.value.value;
            else if (sp.id === 'fontSize') styles.fontSize = sp.value.value;
            else if (sp.id === 'textAlign') styles.textAlign = sp.value.value;
          }
          var moduleIndex = parseInt(moduleId.split('_')[1], 10) || 1;
          tasks.push((async function(mod, text, st, idx) {
            try {
              var images = await options.textImage({ text: text, styles: st, index: idx });
              if (Array.isArray(images) && images.length) {
                updateTextImages(mod, images);
              }
            } catch (e) {}
          })(module, textValue, styles, moduleIndex));
        }
      }

      // 图片模块 → 调用 imageSize
      if (hasImageResolver && moduleId.indexOf('image_hot_area_') === 0) {
        var imageUrl = '';
        var moduleProps2 = module.value.props;
        for (var ip = 0; ip < moduleProps2.length; ip++) {
          if (moduleProps2[ip].id === 'image' && moduleProps2[ip].value && moduleProps2[ip].value.props) {
            var imgFields = moduleProps2[ip].value.props;
            for (var k = 0; k < imgFields.length; k++) {
              if (imgFields[k].id === 'url' && imgFields[k].value) {
                imageUrl = imgFields[k].value.value;
                break;
              }
            }
            break;
          }
        }
        if (imageUrl) {
          tasks.push((async function(mod, url) {
            try {
              var size = await options.imageSize({ url: url });
              if (size && size.width && size.height) {
                updateImageSize(mod, size);
              }
            } catch (e) {}
          })(module, imageUrl));
        }
      }
    }

    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
  }

  // 自动填充所有空值字段，确保提交淘宝接口不报空值错误
  fillEmptyValues(wirelessDesc, {
    imageAspectRatio: options.imageAspectRatio || DEFAULT_IMAGE_ASPECT_RATIO
  });

  return wirelessDesc;
}

// ==================== 辅助方法 ====================

function buildEmptyWirelessDesc(options) {
  return {
    id: 'wirelessDesc', name: '旺铺无线详情描述', type: 'complex',
    value: { props: [buildVersionModule(), buildConfigModule(options)] }
  };
}

function validateHeight(wirelessDesc, maxHeight) {
  maxHeight = maxHeight || MAX_HEIGHT;
  var totalHeight = 0;
  var props = (wirelessDesc.value && wirelessDesc.value.props) || [];
  for (var i = 0; i < props.length; i++) {
    var module = props[i];
    if (module.type !== 'complex' || !module.value || !module.value.props) continue;
    var countHeight = false;
    var moduleHeight = 0;
    var moduleProps = module.value.props;
    for (var j = 0; j < moduleProps.length; j++) {
      var field = moduleProps[j];
      if (field.id === 'countHeight' && field.value && field.value.value === 'true') countHeight = true;
      if (field.id === 'image' && field.value && field.value.props) {
        for (var k = 0; k < field.value.props.length; k++) {
          if (field.value.props[k].id === 'height' && field.value.props[k].value) {
            moduleHeight = parseInt(field.value.props[k].value.value, 10) || 0;
          }
        }
      }
    }
    if (countHeight) totalHeight += moduleHeight;
  }
  return { valid: totalHeight <= maxHeight, totalHeight: totalHeight, maxHeight: maxHeight };
}

function serializeWirelessDesc(wirelessDesc) {
  return JSON.stringify(wirelessDesc);
}

// ==================== 导出 ====================

export {
  // 核心转换
  htmlToWirelessDesc,

  // 辅助方法
  // 辅助方法
  buildEmptyWirelessDesc,
  validateHeight,
  serializeWirelessDesc,
  fillEmptyValues,

  // 模块构造
  buildTextModule,
  buildImageModule,
  buildRichTextModule,
  buildVersionModule,
  buildConfigModule,

  // 内部工具
  extractImages,
  extractText,
  extractStyles,
  parseHtmlSegments,
  mapFontSize,
  mapHeadingSize,
  estimateTextHeight,
  estimateImageHeight,

  // 常量
  MODULE_WIDTH,
  SPLIT_HEIGHT,
  MAX_HEIGHT,
  VERSION,
  IMAGE_MIN_WIDTH,
  IMAGE_MAX_WIDTH,
  IMAGE_MAX_HEIGHT,
  LINE_HEIGHT_RATIO,
  DEFAULT_IMAGE_ASPECT_RATIO
};
