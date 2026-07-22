/**
 * Blackboard - memória efêmera do tick
 * Armazenada em memória temporária (não persistida em Memory)
 */
export default class Blackboard {
  constructor() {
    this._events = [];
    this._alerts = [];
    this._metrics = {};
    this._lastRead = 0;
  }

  emitEvent(event) {
    if (!event || !event.type) throw new Error('Event must have type');
    event.tick = event.tick || (Game ? Game.time : 0);
    this._events.push(event);
  }

  events(since = 0) {
    return this._events.filter(e => e.tick >= since);
  }

  emitAlert(alert) {
    if (!alert || !alert.message) throw new Error('Alert must have message');
    alert.tick = alert.tick || (Game ? Game.time : 0);
    this._alerts.push(alert);
  }

  alerts() {
    return this._alerts.slice();
  }

  clear() {
    this._events = [];
    this._alerts = [];
    this._metrics = {};
    this._lastRead = Game ? Game.time : 0;
  }

  addMetric(key, value) {
    this._metrics[key] = value;
  }

  metrics() {
    return Object.assign({}, this._metrics);
  }
}
