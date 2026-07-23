// Lightweight safe logger for Screeps environment
export default {
  log: (...args) => {
    if (typeof console !== 'undefined' && typeof console.log === 'function') return console.log(...args);
    if (typeof Game !== 'undefined' && typeof Game.notify === 'function') return Game.notify(String(args.join(' ')));
    // last resort: no-op
  },
  warn: (...args) => {
    if (typeof console !== 'undefined' && typeof console.warn === 'function') return console.warn(...args);
    if (typeof console !== 'undefined' && typeof console.log === 'function') return console.log(...args);
    if (typeof Game !== 'undefined' && typeof Game.notify === 'function') return Game.notify(String(args.join(' ')));
  },
  error: (...args) => {
    if (typeof console !== 'undefined' && typeof console.error === 'function') return console.error(...args);
    if (typeof console !== 'undefined' && typeof console.log === 'function') return console.log(...args);
    if (typeof Game !== 'undefined' && typeof Game.notify === 'function') return Game.notify(String(args.join(' ')));
  }
};
