/**
 * 真实提交数据测试 v2 - 复杂图文混合场景
 * 测试文件: submit 测试.json (更新版)
 * 包含: CSS关键字字号(large/x-large)、bold、italic、underline、line-through、
 *       background-color、rgb()颜色、<a>链接、<table>、<ol>列表、emoji图片、普通图片
 */
var fs = require('fs');
var path = require('path');

// 加载源码
var npmSrc = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf-8');
npmSrc = npmSrc.replace(/^export\s*\{[\s\S]*\};?\s*$/m, '');

var fn = new Function(
  'MODULE_WIDTH', 'SPLIT_HEIGHT', 'MAX_HEIGHT', 'VERSION',
  'IMAGE_MIN_WIDTH', 'IMAGE_MAX_WIDTH', 'IMAGE_MAX_HEIGHT',
  npmSrc + '\n' +
  'return { htmlToWirelessDesc, serializeWirelessDesc, validateHeight, parseHtmlSegments, extractStyles, extractText, extractImages };'
);
var context = fn(620, 1240, 100000, '1.0.0', 480, 1500, 2000);

// 读取真实提交数据
var submitData = JSON.parse(fs.readFileSync('d:/Users/Swioon/Desktop/JSON_Files/submit 测试.json', 'utf-8'));
var desc = submitData.item_add.desc;

// 解析已有的 wireless_desc 做对比
var existingWirelessDesc = JSON.parse(submitData.item_add.wireless_desc);

console.log('========== 原始 desc ==========');
console.log(desc.substring(0, 200) + '...\n');

console.log('========== 已有 wireless_desc 结构 ==========');
var existingProps = existingWirelessDesc.value.props;
for (var i = 0; i < existingProps.length; i++) {
  var p = existingProps[i];
  console.log('模块' + (i + 1) + ':', p.id, '(' + p.type + ')');
  // 如果是 text 模块，输出 textStyle.value
  if (p.id && p.id.indexOf('text_') === 0 && p.value && p.value.props) {
    for (var j = 0; j < p.value.props.length; j++) {
      var field = p.value.props[j];
      if (field.id === 'textStyle' && field.value && field.value.props) {
        for (var k = 0; k < field.value.props.length; k++) {
          var sp = field.value.props[k];
          if (sp.id === 'value' || sp.id === 'fontSize' || sp.id === 'color' || sp.id === 'textAlign' || sp.id === 'fontFamily') {
            console.log('  textStyle.' + sp.id + ':', sp.value ? sp.value.value : '(empty)');
          }
        }
      }
    }
  }
  // 如果是 image_hot_area 模块，输出 url
  if (p.id && p.id.indexOf('image_hot_area_') === 0 && p.value && p.value.props) {
    for (var j2 = 0; j2 < p.value.props.length; j2++) {
      var field2 = p.value.props[j2];
      if (field2.id === 'image' && field2.value && field2.value.props) {
        for (var k2 = 0; k2 < field2.value.props.length; k2++) {
          if (field2.value.props[k2].id === 'url') {
            console.log('  image.url:', field2.value.props[k2].value ? field2.value.props[k2].value.value : '(empty)');
          }
        }
      }
    }
  }
}

// 执行转换
(async function() {
  var result = await context.htmlToWirelessDesc(desc);

  console.log('\n========== 转换结果结构 ==========');
  var resultProps = result.value.props;
  for (var i3 = 0; i3 < resultProps.length; i3++) {
    var p3 = resultProps[i3];
    console.log('模块' + (i3 + 1) + ':', p3.id, '(' + p3.type + ')');
    // text 模块详情
    if (p3.id && p3.id.indexOf('text_') === 0 && p3.value && p3.value.props) {
      for (var j3 = 0; j3 < p3.value.props.length; j3++) {
        var field3 = p3.value.props[j3];
        if (field3.id === 'textStyle' && field3.value && field3.value.props) {
          for (var k3 = 0; k3 < field3.value.props.length; k3++) {
            var sp3 = field3.value.props[k3];
            if (['value', 'fontSize', 'color', 'textAlign', 'fontFamily'].indexOf(sp3.id) >= 0) {
              console.log('  textStyle.' + sp3.id + ':', sp3.value ? sp3.value.value : '(empty)');
            }
          }
        }
      }
    }
    // image_hot_area 模块详情
    if (p3.id && p3.id.indexOf('image_hot_area_') === 0 && p3.value && p3.value.props) {
      for (var j4 = 0; j4 < p3.value.props.length; j4++) {
        var field4 = p3.value.props[j4];
        if (field4.id === 'image' && field4.value && field4.value.props) {
          for (var k4 = 0; k4 < field4.value.props.length; k4++) {
            if (['url', 'width', 'height'].indexOf(field4.value.props[k4].id) >= 0) {
              console.log('  image.' + field4.value.props[k4].id + ':', field4.value.props[k4].value ? field4.value.props[k4].value.value : '(empty)');
            }
          }
        }
      }
    }
  }

  console.log('\n========== 对比校验 ==========');

  // 统计模块数量
  var existingTextModules = existingProps.filter(function(p) { return p.id && p.id.indexOf('text_') === 0; });
  var existingImageModules = existingProps.filter(function(p) { return p.id && p.id.indexOf('image_hot_area_') === 0; });
  var resultTextModules = resultProps.filter(function(p) { return p.id && p.id.indexOf('text_') === 0; });
  var resultImageModules = resultProps.filter(function(p) { return p.id && p.id.indexOf('image_hot_area_') === 0; });

  console.log('已有: text=' + existingTextModules.length + ', image=' + existingImageModules.length);
  console.log('转换: text=' + resultTextModules.length + ', image=' + resultImageModules.length);

  // 校验 version 和 config
  var hasVersion = resultProps.some(function(p) { return p.id === 'version'; });
  var hasConfig = resultProps.some(function(p) { return p.id === 'config'; });
  console.log('version 模块:', hasVersion ? '✓' : '✗');
  console.log('config 模块:', hasConfig ? '✓' : '✗');

  // 校验高度
  var validation = context.validateHeight(result);
  console.log('高度校验:', validation.valid ? '✓ 合规' : '✗ 超限');
  console.log('总高度:', validation.totalHeight + 'px / ' + validation.maxHeight + 'px');

  // 对比 text 模块内容
  console.log('\n========== text 模块内容对比 ==========');
  if (existingTextModules.length > 0 && resultTextModules.length > 0) {
    // 提取已有 text 的 value
    function getTextValue(mod) {
      if (!mod.value || !mod.value.props) return '';
      for (var i = 0; i < mod.value.props.length; i++) {
        if (mod.value.props[i].id === 'textStyle' && mod.value.props[i].value && mod.value.props[i].value.props) {
          for (var j = 0; j < mod.value.props[i].value.props.length; j++) {
            if (mod.value.props[i].value.props[j].id === 'value') {
              return mod.value.props[i].value.props[j].value ? mod.value.props[i].value.props[j].value.value : '';
            }
          }
        }
      }
      return '';
    }

    var existingText = getTextValue(existingTextModules[0]);
    var resultText = getTextValue(resultTextModules[0]);

    console.log('已有 text.value:');
    console.log('  ' + existingText.replace(/\n/g, '\\n'));
    console.log('转换 text.value:');
    console.log('  ' + resultText.replace(/\n/g, '\\n'));

    // 对比核心文字内容是否一致
    var existingLines = existingText.split('\\n').filter(function(l) { return l.trim(); });
    var resultLines = resultText.split('\n').filter(function(l) { return l.trim(); });

    console.log('\n已有文字行数:', existingLines.length);
    console.log('转换文字行数:', resultLines.length);

    var matchCount = 0;
    for (var li = 0; li < resultLines.length; li++) {
      var line = resultLines[li].trim();
      for (var eli = 0; eli < existingLines.length; eli++) {
        if (existingLines[eli].trim() === line) { matchCount++; break; }
      }
    }
    console.log('匹配行数:', matchCount + '/' + resultLines.length);
  }

  // 对比 image 模块 URL
  console.log('\n========== image 模块 URL 对比 ==========');
  function getImageUrl(mod) {
    if (!mod.value || !mod.value.props) return '';
    for (var i = 0; i < mod.value.props.length; i++) {
      if (mod.value.props[i].id === 'image' && mod.value.props[i].value && mod.value.props[i].value.props) {
        for (var j = 0; j < mod.value.props[i].value.props.length; j++) {
          if (mod.value.props[i].value.props[j].id === 'url' && mod.value.props[i].value.props[j].value) {
            return mod.value.props[i].value.props[j].value.value;
          }
        }
      }
    }
    return '';
  }

  var existingUrls = existingImageModules.map(getImageUrl);
  var resultUrls = resultImageModules.map(getImageUrl);
  console.log('已有图片 URL:');
  existingUrls.forEach(function(u, i) { console.log('  [' + i + '] ' + u); });
  console.log('转换图片 URL:');
  resultUrls.forEach(function(u, i) { console.log('  [' + i + '] ' + u); });

  var urlMatch = true;
  for (var ui = 0; ui < Math.min(existingUrls.length, resultUrls.length); ui++) {
    if (existingUrls[ui] !== resultUrls[ui]) {
      console.log('URL 不匹配 [' + ui + ']: 已有=' + existingUrls[ui] + ', 转换=' + resultUrls[ui]);
      urlMatch = false;
    }
  }
  if (urlMatch && existingUrls.length === resultUrls.length) {
    console.log('✓ 所有图片 URL 匹配');
  }

  console.log('\n========== 完整 JSON 输出 ==========');
  console.log(JSON.stringify(result, null, 2));
})();
