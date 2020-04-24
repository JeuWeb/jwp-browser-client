import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import pkg from './package.json'
import buble from '@rollup/plugin-buble'
import { terser } from 'rollup-plugin-terser'

export default [
  // browser-friendly UMD build
  {
    input: 'src/main.js',
    output: {
      name: 'jwp',
      file: pkg.browser,
      format: 'umd',
    },
    plugins: [resolve(), commonjs(), buble()],
  },
  {
    input: 'src/main.js',
    output: {
      name: 'jwp',
      file: 'dist/jwp.min.js',
      format: 'umd',
      sourcemap: true,
    },
    plugins: [resolve(), commonjs(), buble(), terser()],
  },

  // CommonJS (for Node) and ES module (for bundlers) build.
  // (We could have three entries in the configuration array
  // instead of two, but it's quicker to generate multiple
  // builds from a single configuration where possible, using
  // an array for the `output` option, where we can specify
  // `file` and `format` for each target)
  {
    input: 'src/main.js',
    output: [
      { file: pkg.main, format: 'cjs' },
      { file: pkg.module, format: 'es' },
    ],
  },
]
