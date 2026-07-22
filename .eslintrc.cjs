/**
 * .eslintrc.cjs
 * Configuração ESLint para Screeps bot
 */

module.exports = {
  env: {
    node: true,
    es2020: true
  },
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module'
  },
  rules: {
    'no-console': 'off', // Screeps usa console
    'no-undef': ['error', { typeof: true }],
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'prefer-const': 'warn',
    'no-var': 'warn',
    semi: ['warn', 'always'],
    quotes: ['warn', 'single', { avoidEscape: true }],
    indent: ['warn', 2],
    'no-trailing-spaces': 'warn',
    eqeqeq: ['warn', 'always']
  },
  globals: {
    Game: 'readonly',
    Memory: 'writable',
    RawMemory: 'readonly',
    FIND_CREEPS: 'readonly',
    FIND_STRUCTURES: 'readonly',
    FIND_SOURCES: 'readonly',
    FIND_MINERALS: 'readonly',
    FIND_DROPPED_RESOURCES: 'readonly',
    STRUCTURE_SPAWN: 'readonly',
    STRUCTURE_TOWER: 'readonly',
    STRUCTURE_STORAGE: 'readonly',
    STRUCTURE_TERMINAL: 'readonly',
    STRUCTURE_ROAD: 'readonly',
    STRUCTURE_WALL: 'readonly',
    STRUCTURE_RAMPART: 'readonly',
    RESOURCE_ENERGY: 'readonly',
    OK: 'readonly',
    ERR_NOT_IN_RANGE: 'readonly',
    ERR_BUSY: 'readonly',
    MOVE: 'readonly',
    WORK: 'readonly',
    CARRY: 'readonly',
    ATTACK: 'readonly',
    HEAL: 'readonly'
  }
};
