/**
 * wirelessDesc 模块单元测试
 * 运行: node test/index.test.js
 */

var fs = require('fs');
var path = require('path');

// 从 npm 包的 src/index.js 加载核心逻辑
var npmSrc = fs.readFileSync(
  path.join(__dirname, '../src/index.js'), 'utf-8'
);
npmSrc = npmSrc.replace(/export\s+\{[\s\S]*\};?\s*$/m, '');
npmSrc = npmSrc.replace(/export\s+/g, '');

var context = {};
try {
  var fn = new Function(
    'MODULE_WIDTH', 'SPLIT_HEIGHT', 'MAX_HEIGHT', 'VERSION',
    'IMAGE_MIN_WIDTH', 'IMAGE_MAX_WIDTH', 'IMAGE_MAX_HEIGHT',
    npmSrc + '\n' +
    'return {' +
    '  htmlToWirelessDesc, buildEmptyWirelessDesc,' +
    '  validateHeight, serializeWirelessDesc,' +
    '  buildTextModule, buildImageModule, buildRichTextModule, buildVersionModule, buildConfigModule,' +
    '  extractImages, extractText, extractStyles, parseHtmlSegments, mapFontSize, mapHeadingSize,' +
    '  MODULE_WIDTH, SPLIT_HEIGHT, MAX_HEIGHT, VERSION,' +
    '  IMAGE_MIN_WIDTH, IMAGE_MAX_WIDTH, IMAGE_MAX_HEIGHT' +
    '};'
  );
  context = fn(620, 1240, 100000, '1.0.0', 480, 1500, 2000);
} catch (e) {
  console.error('加载源码失败:', e.message);
  process.exit(1);
}

// ==================== 测试框架 ====================

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log('  \u2713 ' + msg);
    passed++;
  } else {
    console.log('  \u2717 ' + msg);
    failed++;
  }
}

function assertEqual(actual, expected, msg) {
  var isEqual = JSON.stringify(actual) === JSON.stringify(expected);
  if (!isEqual) {
    console.log('    期望:', JSON.stringify(expected));
    console.log('    实际:', JSON.stringify(actual));
  }
  assert(isEqual, msg);
}

// ==================== 测试: extractText ====================

console.log('\n\uD83D\uDCE6 测试 extractText');
assertEqual(context.extractText('<p>Hello World</p>'), 'Hello World', '提取 <p> 标签文字');
assertEqual(context.extractText('<h2>上新推荐</h2><img src="xxx.jpg"><br>'), '上新推荐', '提取 h2 标签文字，忽略 img 和 br');
assertEqual(context.extractText('<p>第一段</p><p>第二段</p>'), '第一段\n第二段', '多段文字保留换行');

// ==================== 测试: extractImages ====================

console.log('\n\uD83D\uDCE6 测试 extractImages');
var imgs = context.extractImages('<img src="http://a.jpg"><p>text</p><img src="http://b.jpg">');
assert(imgs.length === 2, '提取2张图片');
if (imgs.length >= 2) {
  assert(imgs[0].url === 'http://a.jpg', '第一张图片 URL 正确');
  assert(imgs[1].url === 'http://b.jpg', '第二张图片 URL 正确');
}

// ==================== 测试: mapFontSize ====================

console.log('\n\uD83D\uDCE6 测试 mapFontSize');
assertEqual(context.mapFontSize(14), '14', '14px 直接映射');
assertEqual(context.mapFontSize(15), '14', '15px 映射到最近的 14');
assertEqual(context.mapFontSize(26), '24', '26px 映射到最近的 24');
assertEqual(context.mapFontSize(100), '60', '100px 映射到最大的 60');

// ==================== 测试: mapHeadingSize ====================

console.log('\n\uD83D\uDCE6 测试 mapHeadingSize');
assertEqual(context.mapHeadingSize(1), '28', 'h1 → 28');
assertEqual(context.mapHeadingSize(2), '24', 'h2 → 24');
assertEqual(context.mapHeadingSize(3), '20', 'h3 → 20');

// ==================== 测试: parseHtmlSegments ====================

console.log('\n\uD83D\uDCE6 测试 parseHtmlSegments');
var segs = context.parseHtmlSegments('<p><h2>上新推荐</h2><img src="https://img.alicdn.com/xxx.jpg" align="absmiddle"><br></p>');
assert(segs.length === 2, '解析出2个片段（1文字+1图片）');
if (segs.length >= 2) {
  assert(segs[0].type === 'text', '第一个片段是文字');
  assert(segs[0].content === '上新推荐', '文字内容正确');
  assert(segs[1].type === 'image', '第二个片段是图片');
  assert(segs[1].url === 'https://img.alicdn.com/xxx.jpg', '图片 URL 正确');
}

// ==================== 测试: buildVersionModule ====================

console.log('\n\uD83D\uDCE6 测试 buildVersionModule');
var versionModule = context.buildVersionModule();
assert(versionModule && versionModule.id === 'version', 'version 模块 id 正确');
assert(versionModule && versionModule.value && versionModule.value.value === '1.0.0', 'version 值为 1.0.0');

// ==================== 测试: buildConfigModule ====================

console.log('\n\uD83D\uDCE6 测试 buildConfigModule');
var configModule = context.buildConfigModule();
assert(configModule && configModule.id === 'config', 'config 模块 id 正确');
assert(configModule && configModule.type === 'complex', 'config 类型为 complex');

// ==================== 测试: buildTextModule ====================

console.log('\n\uD83D\uDCE6 测试 buildTextModule');
var textModule = context.buildTextModule({ text: '测试描述', index: 1 });
assert(textModule && textModule.id === 'text_1', 'text 模块 id 正确');
assert(textModule && textModule.type === 'complex', 'text 类型为 complex');
if (textModule) {
  var textStyle = textModule.value.props.find(function(p) { return p.id === 'textStyle'; });
  var valueField = textStyle && textStyle.value.props.find(function(p) { return p.id === 'value'; });
  assert(valueField && valueField.value && valueField.value.value === '测试描述', 'textStyle.value 文字内容正确');
}

// ==================== 测试: buildImageModule ====================

console.log('\n\uD83D\uDCE6 测试 buildImageModule');
var imgModule = context.buildImageModule({
  url: 'https://img.alicdn.com/xxx.jpg',
  width: 620,
  height: 827,
  index: 0
});
assert(imgModule && imgModule.id === 'image_hot_area_0', 'image 模块 id 正确');
assert(imgModule && imgModule.type === 'complex', 'image 类型为 complex');
if (imgModule) {
  var imageField = imgModule.value.props.find(function(p) { return p.id === 'image'; });
  var urlField = imageField && imageField.value.props.find(function(p) { return p.id === 'url'; });
  assert(urlField && urlField.value && urlField.value.value === 'https://img.alicdn.com/xxx.jpg', '图片 URL 正确');
}

// ==================== 测试: htmlToWirelessDesc 核心转换（async/await） ====================

console.log('\n\uD83D\uDCE6 测试 htmlToWirelessDesc 核心转换');
var testHtml = '<p><h2>上新推荐</h2><img src="https://img.alicdn.com/imgextra/i3/123977891/O1CN01gWctsa28A8BXuPbV9_!!123977891.jpg" align="absmiddle"><br></p>';

// htmlToWirelessDesc 是 async 函数，返回 Promise
context.htmlToWirelessDesc(testHtml).then(function(result) {
  assert(result.id === 'wirelessDesc', '顶层 id 为 wirelessDesc');
  assert(result.name === '旺铺无线详情描述', '顶层 name 正确');
  assert(result.type === 'complex', '顶层 type 为 complex');

  var props = result.value.props;
  var textModules = props.filter(function(p) { return p.id && p.id.indexOf('text_') === 0; });
  var imageModules = props.filter(function(p) { return p.id && p.id.indexOf('image_hot_area_') === 0; });
  var versionModules = props.filter(function(p) { return p.id === 'version'; });
  var configModules = props.filter(function(p) { return p.id === 'config'; });

  assert(textModules.length === 1, '包含1个文字模块');
  assert(imageModules.length === 1, '包含1个图片热区模块');
  assert(versionModules.length === 1, '包含version模块');
  assert(configModules.length === 1, '包含config模块');

  // 验证文字内容
  if (textModules.length > 0) {
    var textStyle2 = textModules[0].value.props.find(function(p) { return p.id === 'textStyle'; });
    var valueField2 = textStyle2 && textStyle2.value.props.find(function(p) { return p.id === 'value'; });
    assert(valueField2 && valueField2.value.value === '上新推荐', '文字模块内容为"上新推荐"');

    var fontSizeField = textStyle2 && textStyle2.value.props.find(function(p) { return p.id === 'fontSize'; });
    assert(fontSizeField && fontSizeField.value.value === '24', 'h2 标签字号映射为 24');
  }

  // 验证图片 URL
  if (imageModules.length > 0) {
    var imageField2 = imageModules[0].value.props.find(function(p) { return p.id === 'image'; });
    var urlField2 = imageField2 && imageField2.value.props.find(function(p) { return p.id === 'url'; });
    assert(
      urlField2 && urlField2.value.value === 'https://img.alicdn.com/imgextra/i3/123977891/O1CN01gWctsa28A8BXuPbV9_!!123977891.jpg',
      '图片 URL 正确'
    );
  }

  // 验证模块顺序
  var textIndex = -1, imageIndex = -1;
  for (var i = 0; i < props.length; i++) {
    if (props[i].id && props[i].id.indexOf('text_') === 0) textIndex = i;
    if (props[i].id && props[i].id.indexOf('image_hot_area_') === 0) imageIndex = i;
  }
  assert(textIndex < imageIndex, '文字模块排在图片模块前面');

  // ==================== 测试: 带 resolvers 的异步补全 ====================

  console.log('\n\uD83D\uDCE6 测试 htmlToWirelessDesc 带 resolvers 异步补全');

  return context.htmlToWirelessDesc(testHtml, {
    imageSize: function(ref) {
      assert(ref.url === 'https://img.alicdn.com/imgextra/i3/123977891/O1CN01gWctsa28A8BXuPbV9_!!123977891.jpg', 'imageSize 接收到正确的 url');
      return Promise.resolve({ width: 900, height: 1200 });
    },
    textImage: function(ref) {
      assert(ref.text === '上新推荐', 'textImage 接收到正确的 text');
      return Promise.resolve([{ url: 'https://cdn.example.com/text-image.png', width: 620, height: 62 }]);
    }
  });

}).then(function(resolved) {
  // 验证图片尺寸补全（900x1200 按620宽度缩放 → 620x827）
  var imgModules = resolved.value.props.filter(function(p) { return p.id && p.id.indexOf('image_hot_area_') === 0; });
  if (imgModules.length > 0) {
    var imgField = imgModules[0].value.props.find(function(p) { return p.id === 'image'; });
    var wField = imgField && imgField.value.props.find(function(p) { return p.id === 'width'; });
    var hField = imgField && imgField.value.props.find(function(p) { return p.id === 'height'; });
    assert(wField && wField.value.value === '620', '图片宽度缩放为 620');
    assert(hField && hField.value.value === '827', '图片高度缩放为 827');
  }

  // 验证文字合图补全
  var txtModules = resolved.value.props.filter(function(p) { return p.id && p.id.indexOf('text_') === 0; });
  if (txtModules.length > 0) {
    var imagesField = txtModules[0].value.props.find(function(p) { return p.id === 'images'; });
    assert(imagesField && imagesField.values.length === 1, '文字模块 images 已补全');
    if (imagesField && imagesField.values.length > 0) {
      var imgUrlField = imagesField.values[0].props.find(function(p) { return p.id === 'url'; });
      assert(imgUrlField && imgUrlField.value.value === 'https://cdn.example.com/text-image.png', '文字合图 URL 正确');
    }
  }

  // 验证 serializeWirelessDesc
  var jsonStr = context.serializeWirelessDesc(resolved);
  assert(typeof jsonStr === 'string', 'serializeWirelessDesc 返回字符串');
  assert(jsonStr.indexOf('wirelessDesc') > -1, '序列化后包含 wirelessDesc');

  // 验证 validateHeight
  var heightCheck = context.validateHeight(resolved);
  assert(heightCheck.valid === true, '高度校验通过');
  assert(heightCheck.totalHeight === 827, '总高度为 827');

  // ==================== 测试: 不传 resolvers 也能正常工作 ====================
  console.log('\n\uD83D\uDCE6 测试 htmlToWirelessDesc 不传 resolvers');
  return context.htmlToWirelessDesc('<p>test</p>');

}).then(function(r) {
  assert(r.id === 'wirelessDesc', '不传 resolvers 正常返回 wirelessDesc');

  // ==================== 测试: 空输入 ====================
  console.log('\n\uD83D\uDCE6 测试 htmlToWirelessDesc 空输入');
  return context.htmlToWirelessDesc('');

}).then(function(r) {
  assert(r.id === 'wirelessDesc', '空输入返回空的 wirelessDesc');
  assert(r.value.props.length === 2, '空输入仅包含 version + config');

  printSummary();

}).catch(function(err) {
  console.error('测试失败:', err);
  printSummary();
});

function printSummary() {
  console.log('\n' + '='.repeat(50));
  console.log('测试结果: ' + passed + ' 通过, ' + failed + ' 失败');
  console.log('='.repeat(50));
  if (failed > 0) process.exit(1);
}
