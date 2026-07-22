/**
 * src/config.js
 * Configurações globais da aplicação
 */

export const config = {
  kernel: {
    cpuBudget: 19,
    cpuReserve: 2
  },
  logging: {
    enabled: true,
    metricsInterval: 10 // ticks
  },
  upload: {
    host: '127.0.0.1',
    port: 21025
  }
};

export default config;
