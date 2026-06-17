/**
 * 使用 submit 测试.json 真实数据测试 wirelessDesc 转换
 * 特点：29 张纯图片，无文字
 */
var fs = require('fs');
var path = require('path');

// 加载 npm 包源码（去掉 ES module 语法）
var src = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf-8');
// 移除 export 语句
src = src.replace(/export\s*\{[\s\S]*\};?\s*$/m, '');
src = src.replace(/export\s+/g, '');
// 包装为可执行函数
var fn = new Function(src + '\nreturn { htmlToWirelessDesc, validateHeight, serializeWirelessDesc, parseHtmlSegments, extractImages, extractText };');
var api = fn();

// 读取真实提交数据
var submitData = JSON.parse(
  fs.readFileSync(path.join('d:/Users/Swioon/Desktop/JSON_Files/submit 测试.json'), 'utf-8')
);

var desc = submitData.item_add.desc;

console.log('========== 输入分析 ==========');
console.log('desc 长度:', desc.length, '字符');

// 提取图片
var images = api.extractImages(desc);
console.log('图片数量:', images.length);

// 提取文字
var text = api.extractText(desc);
console.log('文字内容:', JSON.stringify(text));
console.log('文字是否为空:', !text);

// 解析 segments
var segments = api.parseHtmlSegments(desc);
console.log('段落数量:', segments.length);
var textCount = 0;
var imageCount = 0;
for (var i = 0; i < segments.length; i++) {
  if (segments[i].type === 'text') textCount++;
  if (segments[i].type === 'image') imageCount++;
}
console.log('  文字段:', textCount);
console.log('  图片段:', imageCount);

// 执行转换（async）
(async function() {
  var result = await api.htmlToWirelessDesc(desc);

  console.log('\n========== 转换结果 ==========');
  var props = result.value.props;
  console.log('模块总数:', props.length);

  // 分类统计
  var textModules = [];
  var imageModules = [];
  var otherModules = [];
  for (var i = 0; i < props.length; i++) {
    if (props[i].id.indexOf('text_') === 0) textModules.push(props[i]);
    else if (props[i].id.indexOf('image_hot_area_') === 0) imageModules.push(props[i]);
    else otherModules.push(props[i]);
  }
  console.log('  text 模块:', textModules.length);
  console.log('  image_hot_area 模块:', imageModules.length);
  console.log('  其他模块 (version/config):', otherModules.length);

  // 验证每个图片模块
  console.log('\n========== 图片模块详情 ==========');
  for (var j = 0; j < imageModules.length; j++) {
    var mod = imageModules[j];
    var imgUrl = '';
    var imgWidth = '';
    var imgHeight = '';
    var enable = '';
    var countHeight = '';
    var groupId = '';
    var hotAreaLen = 0;
    var modProps = mod.value.props;
    for (var k = 0; k < modProps.length; k++) {
      if (modProps[k].id === 'image' && modProps[k].value && modProps[k].value.props) {
        for (var m = 0; m < modProps[k].value.props.length; m++) {
          if (modProps[k].value.props[m].id === 'url') imgUrl = modProps[k].value.props[m].value.value;
          if (modProps[k].value.props[m].id === 'width') imgWidth = modProps[k].value.props[m].value.value;
          if (modProps[k].value.props[m].id === 'height') imgHeight = modProps[k].value.props[m].value.value;
        }
      }
      if (modProps[k].id === 'enable') enable = modProps[k].value.value;
      if (modProps[k].id === 'countHeight') countHeight = modProps[k].value.value;
      if (modProps[k].id === 'id') groupId = modProps[k].value.value;
      if (modProps[k].id === 'hot_area') hotAreaLen = (modProps[k].values || []).length;
    }
    console.log(
      '  [' + j + '] ' + mod.id +
      ' | url: ' + (imgUrl.length > 60 ? imgUrl.substring(0, 60) + '...' : imgUrl) +
      ' | size: ' + imgWidth + 'x' + imgHeight +
      ' | enable: ' + enable +
      ' | countHeight: ' + countHeight +
      ' | hotAreas: ' + hotAreaLen +
      ' | groupId: ' + groupId
    );
  }

  // 验证 version 和 config
  console.log('\n========== 固定模块 ==========');
  for (var n = 0; n < otherModules.length; n++) {
    console.log('  ' + otherModules[n].id + ':', JSON.stringify(otherModules[n]));
  }

  // 校验高度
  console.log('\n========== 高度校验 ==========');
  var validation = api.validateHeight(result);
  console.log('countHeight=true 模块总高度:', validation.totalHeight);
  console.log('最大限制:', validation.maxHeight);
  console.log('是否合规:', validation.valid);
  console.log('（注意：无 imageSize resolver 时，图片 height 为空，总高度为 0）');

  // 序列化长度
  console.log('\n========== 序列化 ==========');
  var serialized = api.serializeWirelessDesc(result);
  console.log('序列化后长度:', serialized.length, '字符');

  // 验证关键规则
  console.log('\n========== 规则校验 ==========');
  var pass = true;

  // 规则1: 每个图片模块都有 enable=true
  for (var p = 0; p < imageModules.length; p++) {
    var en = '';
    var pProps = imageModules[p].value.props;
    for (var q = 0; q < pProps.length; q++) {
      if (pProps[q].id === 'enable') en = pProps[q].value.value;
    }
    if (en !== 'true') {
      console.log('  ❌ 图片模块 ' + imageModules[p].id + ' enable=' + en);
      pass = false;
    }
  }
  console.log('  ✓ 所有图片模块 enable=true');

  // 规则2: 每个图片模块都有 countHeight=true
  for (var r = 0; r < imageModules.length; r++) {
    var ch = '';
    var rProps = imageModules[r].value.props;
    for (var s = 0; s < rProps.length; s++) {
      if (rProps[s].id === 'countHeight') ch = rProps[s].value.value;
    }
    if (ch !== 'true') {
      console.log('  ❌ 图片模块 ' + imageModules[r].id + ' countHeight=' + ch);
      pass = false;
    }
  }
  console.log('  ✓ 所有图片模块 countHeight=true');

  // 规则3: 每个图片模块都有 hot_area
  for (var t = 0; t < imageModules.length; t++) {
    var ha = false;
    var tProps = imageModules[t].value.props;
    for (var u = 0; u < tProps.length; u++) {
      if (tProps[u].id === 'hot_area') ha = true;
    }
    if (!ha) {
      console.log('  ❌ 图片模块 ' + imageModules[t].id + ' 缺少 hot_area');
      pass = false;
    }
  }
  console.log('  ✓ 所有图片模块都有 hot_area 字段');

  // 规则4: 每个图片模块都有 sample
  for (var v = 0; v < imageModules.length; v++) {
    var sa = false;
    var vProps = imageModules[v].value.props;
    for (var w = 0; w < vProps.length; w++) {
      if (vProps[w].id === 'sample') sa = true;
    }
    if (!sa) {
      console.log('  ❌ 图片模块 ' + imageModules[v].id + ' 缺少 sample');
      pass = false;
    }
  }
  console.log('  ✓ 所有图片模块都有 sample 字段');

  // 规则5: 图片数量一致
  if (imageModules.length === images.length) {
    console.log('  ✓ 图片模块数(' + imageModules.length + ')与原图数(' + images.length + ')一致');
  } else {
    console.log('  ❌ 图片模块数(' + imageModules.length + ')与原图数(' + images.length + ')不一致');
    pass = false;
  }

  // 规则6: 没有 text 模块（因为输入无文字）
  if (textModules.length === 0) {
    console.log('  ✓ 无文字时不生成 text 模块');
  } else {
    console.log('  ⚠ 纯图片输入生成了 text 模块（可能空白文字被解析）');
    for (var x = 0; x < textModules.length; x++) {
      var txtVal = '';
      var xProps = textModules[x].value.props;
      for (var y = 0; y < xProps.length; y++) {
        if (xProps[y].id === 'textStyle' && xProps[y].value && xProps[y].value.props) {
          for (var z = 0; z < xProps[y].value.props.length; z++) {
            if (xProps[y].value.props[z].id === 'value') {
              txtVal = xProps[y].value.props[z].value.value;
            }
          }
        }
      }
      console.log('    text_' + (x+1) + ' 内容: ' + JSON.stringify(txtVal));
    }
  }

  // 规则7: version 和 config 存在
  var hasVersion = false;
  var hasConfig = false;
  for (var a = 0; a < otherModules.length; a++) {
    if (otherModules[a].id === 'version') hasVersion = true;
    if (otherModules[a].id === 'config') hasConfig = true;
  }
  if (hasVersion) console.log('  ✓ 包含 version 模块');
  else { console.log('  ❌ 缺少 version 模块'); pass = false; }
  if (hasConfig) console.log('  ✓ 包含 config 模块');
  else { console.log('  ❌ 缺少 config 模块'); pass = false; }

  console.log('\n========== 测试结果 ==========');
  console.log(pass ? '✅ 全部通过' : '❌ 存在问题');

  // 输出第一个图片模块的完整结构供对比
  console.log('\n========== 首个图片模块完整结构（供与提交示例对比）==========');
  console.log(JSON.stringify(imageModules[0], null, 2));
})();
