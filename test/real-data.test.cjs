/**
 * 使用真实提交数据验证 wirelessDesc 转换
 * 模拟 submit.json 中的 desc 字段
 */
var fs = require('fs');
var path = require('path');

var npmSrc = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf-8');
npmSrc = npmSrc.replace(/export\s+\{[\s\S]*\};?\s*$/m, '');
npmSrc = npmSrc.replace(/export\s+/g, '');

var fn = new Function(
  'MODULE_WIDTH', 'SPLIT_HEIGHT', 'MAX_HEIGHT', 'VERSION',
  'IMAGE_MIN_WIDTH', 'IMAGE_MAX_WIDTH', 'IMAGE_MAX_HEIGHT',
  npmSrc + '\n' +
  'return { htmlToWirelessDesc, serializeWirelessDesc, validateHeight };'
);
var context = fn(620, 1240, 100000, '1.0.0', 480, 1500, 2000);

// 真实 desc 内容
var realDesc = '<p><h2>上新推荐</h2><img src="https://img.alicdn.com/imgextra/i3/123977891/O1CN01gWctsa28A8BXuPbV9_!!123977891.jpg" align="absmiddle"><br></p>';

// 不带 resolvers
context.htmlToWirelessDesc(realDesc).then(function(result) {
  console.log('========== 转换结果 ==========\n');
  console.log(JSON.stringify(result, null, 2));

  console.log('\n========== 校验高度 ==========');
  var validation = context.validateHeight(result);
  console.log('总高度:', validation.totalHeight);
  console.log('是否合规:', validation.valid);

  console.log('\n========== 序列化后(接口提交用) ==========');
  var serialized = context.serializeWirelessDesc(result);
  console.log('长度:', serialized.length, '字符');

  console.log('\n========== 结构对比(与提交示例) ==========');
  var props = result.value.props;
  for (var i = 0; i < props.length; i++) {
    console.log('模块' + (i + 1) + ':', props[i].id, '(' + props[i].type + ')');
  }

  // 带 resolvers 异步补全
  console.log('\n========== 带 resolvers 异步补全 ==========');
  return context.htmlToWirelessDesc(realDesc, {
    imageSize: function(ref) {
      return Promise.resolve({ width: 900, height: 1200 });
    },
    textImage: function(ref) {
      return Promise.resolve([{ url: 'https://cdn.example.com/text-img.png', width: 620, height: 62 }]);
    }
  });
}).then(function(resolved) {
  console.log('补全后图片高度:', resolved.value.props[1].value.props[0].value.props[2].value.value);
  console.log('补全后文字合图:', JSON.stringify(resolved.value.props[0].value.props[0].values[0].props[1].value.value));
  var v = context.validateHeight(resolved);
  console.log('补全后总高度:', v.totalHeight, '合规:', v.valid);
});
