#!/usr/bin/env node

/**
 * Manual build script para Screeps
 * Cria estrutura de dist/ compatível com Screeps server
 * Copia arquivos sem tentar resolver/bundle dependências
 */

const fs = require('fs');
const path = require('path');

const srcDir = './src';
const distDir = './dist';

// Cria dist/ se não existir
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Cria subdirs
['kernel', 'core'].forEach(dir => {
  const dirPath = path.join(distDir, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Copia arquivos
function copyFile(src, dst) {
  const content = fs.readFileSync(src, 'utf8');
  fs.writeFileSync(dst, content);
  console.log('✓ ' + dst);
}

// Copia módulos
copyFile(path.join(srcDir, 'kernel', 'Kernel.js'), path.join(distDir, 'kernel', 'Kernel.js'));
copyFile(path.join(srcDir, 'core', 'WorldModel.js'), path.join(distDir, 'core', 'WorldModel.js'));

// Gera main.js que referencia os arquivos copiados
const mainContent = `// Screeps Bot - Main Entry Point
// Auto-generated build - do not edit

const Kernel = require('./kernel/Kernel.js');
const WorldModel = require('./core/WorldModel.js');

// Singleton global para preservar estado entre ticks
let kernelInstance = null;

function initKernel() {
  if (kernelInstance) return kernelInstance;

  kernelInstance = new Kernel({
    cpuBudget: 19,
    cpuReserve: 2,
    subsystems: {
      worldModel: (k) => new WorldModel(),
      spatialEngine: (k) => ({ tick: () => {} }),
      workingMemory: (k) => ({ tick: () => {} }),
      blackboard: (k) => ({ tick: () => {}, clear: () => {} }),
      decisionEngine: (k) => ({ tick: () => {} }),
      taskFactory: (k) => ({ tick: () => {} }),
      taskEngine: (k) => ({ tick: () => {} }),
      scheduler: (k) => ({ tick: () => {} }),
      agentRuntime: (k) => ({ tick: () => {} }),
      commandEngine: (k) => ({ tick: () => {} })
    }
  });

  return kernelInstance;
}

module.exports.loop = function () {
  try {
    const kernel = initKernel();
    const result = kernel.tick();

    if (Game.time % 10 === 0) {
      const metrics = kernel.metrics();
      console.log('[T' + Game.time + '] CPU: ' + metrics.cpuUsed.toFixed(2) + '/' + metrics.cpuBudget + ' (reserve: ' + metrics.cpuRemaining.toFixed(2) + ')');
    }

    if (!result.success && result.errors.length > 0) {
      console.warn('[T' + Game.time + '] Errors in tick:', result.errors);
    }
  } catch (err) {
    console.error('[CRITICAL] Main loop error:', err.message);
    console.error(err.stack);
  }
};`;

fs.writeFileSync(path.join(distDir, 'main.js'), mainContent);
console.log('✓ ' + path.join(distDir, 'main.js'));

console.log('\n✓ Build complete!');
