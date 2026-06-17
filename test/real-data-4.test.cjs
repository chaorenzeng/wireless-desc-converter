var fs = require('fs');
var path = require('path');

// 加载 npm 包源码
var npmSrc = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf-8');
// 移除 ES module export 语法
npmSrc = npmSrc.replace(/^export\s*\{[\s\S]*$/m, '');

// 提取常量和方法
var fn = new Function(
  'MODULE_WIDTH', 'SPLIT_HEIGHT', 'MAX_HEIGHT', 'VERSION',
  'IMAGE_MIN_WIDTH', 'IMAGE_MAX_WIDTH', 'IMAGE_MAX_HEIGHT',
  npmSrc + '\n' +
  'return { htmlToWirelessDesc, serializeWirelessDesc, validateHeight, extractStyles, parseHtmlSegments, mapFontSize };'
);
var context = fn(620, 1240, 100000, '1.0.0', 480, 1500, 2000);

// 读取真实提交数据
var submitData = JSON.parse(fs.readFileSync('d:/Users/Swioon/Desktop/JSON_Files/submit 测试2.json', 'utf-8'));
var desc = submitData.item_add.desc;
var existingWirelessDesc = JSON.parse(submitData.item_add.wireless_desc);

console.log('========== 原始 desc ==========');
console.log(desc);
console.log('');

// 转换
context.htmlToWirelessDesc(desc).then(function(result) {
  console.log('========== 转换结果 ==========');
  var serialized = JSON.stringify(result, null, 2);
  console.log(serialized);

  // 与已有 wireless_desc 对比
  console.log('\n========== 与已有 wireless_desc 结构对比 ==========');
  var ourProps = result.value.props;
  var existProps = existingWirelessDesc.value.props;

  console.log('已有模块数:', existProps.length);
  console.log('我们模块数:', ourProps.length);

  for (var i = 0; i < Math.max(ourProps.length, existProps.length); i++) {
    var our = ourProps[i];
    var exist = existProps[i];
    if (!our) { console.log('  [' + i + '] 已有: ' + exist.id + ' | 我们: (无)'); continue; }
    if (!exist) { console.log('  [' + i + '] 已有: (无) | 我们: ' + our.id); continue; }

    console.log('\n--- 模块 ' + i + ': ' + our.id + ' vs ' + exist.id + ' ---');

    // 文字模块对比
    if (our.id.indexOf('text') === 0) {
      var ourTextProps = our.value.props;
      var existTextProps = exist.value.props;
      for (var j = 0; j < Math.max(ourTextProps.length, existTextProps.length); j++) {
        var ourP = ourTextProps[j];
        var existP = existTextProps[j];
        if (!ourP || !existP) continue;
        if (ourP.id === existP.id) {
          if (ourP.id === 'textStyle') {
            // 对比 textStyle 内部
            var ourStyleProps = ourP.value.props;
            var existStyleProps = existP.value.props;
            for (var k = 0; k < Math.max(ourStyleProps.length, existStyleProps.length); k++) {
              var ourS = ourStyleProps[k];
              var existS = existStyleProps[k];
              if (!ourS || !existS) continue;
              if (ourS.id === existS.id) {
                var ourVal = ourS.value && ourS.value.value;
                var existVal = existS.value && existS.value.value;
                var match = ourVal === existVal ? '✓' : '✗';
                if (ourVal !== existVal) {
                  console.log('    ' + ourS.id + ': 已有=' + existVal + ' | 我们=' + ourVal + ' ' + match);
                }
              }
            }
          } else if (ourP.id === 'id') {
            console.log('  id: 已有=' + (existP.value && existP.value.value) + ' | 我们=' + (ourP.value && ourP.value.value));
          }
        }
      }
    }

    // 图片模块对比
    if (our.id.indexOf('image') === 0) {
      var ourImgProps = our.value.props;
      var existImgProps = exist.value.props;
      for (var j = 0; j < Math.max(ourImgProps.length, existImgProps.length); j++) {
        var ourP = ourImgProps[j];
        var existP = existImgProps[j];
        if (!ourP || !existP) continue;
        if (ourP.id === 'image' && existP.id === 'image') {
          var ourImgUrl = '', existImgUrl = '';
          for (var k = 0; k < ourP.value.props.length; k++) {
            if (ourP.value.props[k].id === 'url') ourImgUrl = ourP.value.props[k].value.value;
            if (ourP.value.props[k].id === 'height') {
              console.log('  height: 已有=' + existP.value.props[k].value.value + ' | 我们=' + ourP.value.props[k].value.value);
            }
          }
          for (var k = 0; k < existP.value.props.length; k++) {
            if (existP.value.props[k].id === 'url') existImgUrl = existP.value.props[k].value.value;
          }
          console.log('  url 匹配: ' + (ourImgUrl === existImgUrl ? '✓' : '✗'));
          if (ourImgUrl !== existImgUrl) {
            console.log('    已有: ' + existImgUrl);
            console.log('    我们: ' + ourImgUrl);
          }
        }
      }
    }
  }

  // 高度校验
  console.log('\n========== 高度校验 ==========');
  var validation = context.validateHeight(result);
  console.log('总高度:', validation.totalHeight);
  console.log('合规:', validation.valid);

  // 关键字段详细对比
  console.log('\n========== 关键样式字段对比 ==========');
  var ourTextModule = ourProps.filter(function(p) { return p.id.indexOf('text') === 0; })[0];
  var existTextModule = existProps.filter(function(p) { return p.id.indexOf('text') === 0; })[0];

  if (ourTextModule && existTextModule) {
    function getStyleVal(mod, key) {
      var ts = mod.value.props.filter(function(p) { return p.id === 'textStyle'; })[0];
      if (!ts) return undefined;
      var item = ts.value.props.filter(function(p) { return p.id === key; })[0];
      return item && item.value && item.value.value;
    }
    var keys = ['fontFamily', 'color', 'fontSize', 'textAlign', 'top', 'bottom', 'left', 'right', 'width', 'value'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var ours = getStyleVal(ourTextModule, k);
      var exists = getStyleVal(existTextModule, k);
      var match = ours === exists ? '✓' : '✗';
      console.log('  ' + k + ': 已有=' + exists + ' | 我们=' + ours + ' ' + match);
    }
  }
});
