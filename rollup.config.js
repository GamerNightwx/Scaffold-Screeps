/**
 * rollup.config.js
 * Configuração de build para Screeps
 *
 * - Input: src/main.js
 * - Output: dist/main.js (single file, CommonJS)
 * - Preserva estrutura modular sem bundling de require()
 */

export default {
  input: 'src/main.js',
  output: {
    file: 'dist/main.js',
    format: 'cjs',
    exports: 'default',
    strict: false // Screeps não quer 'use strict' no topo
  },
  external: [],
  plugins: []
};
