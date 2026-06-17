import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import { terser } from 'rollup-plugin-terser';

const input = 'src/index.js';

export default [
  // UMD build (浏览器 / Node.js)
  {
    input,
    output: {
      file: 'dist/wireless-desc-converter.umd.js',
      format: 'umd',
      name: 'WirelessDescConverter',
      exports: 'named',
      sourcemap: true,
    },
    plugins: [resolve(), commonjs()],
  },
  // UMD minified
  {
    input,
    output: {
      file: 'dist/wireless-desc-converter.umd.min.js',
      format: 'umd',
      name: 'WirelessDescConverter',
      exports: 'named',
    },
    plugins: [resolve(), commonjs(), terser()],
  },
  // ESM build (现代打包工具)
  {
    input,
    output: {
      file: 'dist/wireless-desc-converter.esm.js',
      format: 'esm',
      sourcemap: true,
    },
    plugins: [resolve(), commonjs()],
  },
  // CJS build (Node.js require)
  {
    input,
    output: {
      file: 'dist/wireless-desc-converter.cjs.js',
      format: 'cjs',
      exports: 'named',
      sourcemap: true,
    },
    plugins: [resolve(), commonjs()],
  },
];
