/**
 * rollup.config.js
 * Configuração de build para Screeps
 *
 * - Input: src/main.js
 * - Output: dist/main.js (single file, CommonJS)
 * - Named export: module.exports.loop
 */

export default {
  input: 'src/main.js',
  output: {
    file: 'dist/main.js',
    format: 'cjs',
    exports: 'named', // Screeps precisa de named exports
    strict: false
  },
  external: [],
  plugins: []
};
