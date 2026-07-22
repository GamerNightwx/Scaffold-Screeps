/**
 * WorkingMemory - persistência versionada para Goals, Reservations, Templates
 * Armazena no Memory.workingMemory (objeto JSON serializável)
 * Cada objeto é um VersionedObject: { id, createdTick, versionToken, valid, data }
 */
export default class WorkingMemory {
  constructor(options = {}) {
    this.historySize = typeof options.historySize === 'number' ? options.historySize : 5;
    if (!globalThis.Memory) globalThis.Memory = {};
    if (!Memory.workingMemory) Memory.workingMemory = { collections: {} };
    this.store = Memory.workingMemory.collections;
  }

  _ensureCollection(collection) {
    if (!this.store[collection]) this.store[collection] = {};
    return this.store[collection];
  }

  _makeVersionToken(obj) {
    // Simple token based on timestamp + JSON length + random suffix
    try {
      return `${Date.now()}-${JSON.stringify(obj).length}-${Math.floor(Math.random()*10000)}`;
    } catch (e) {
      return `${Date.now()}-0-${Math.floor(Math.random()*10000)}`;
    }
  }

  /**
   * Salva objeto com versionamento
   * @param {string} collection
   * @param {Object} obj - must contain id and data
   */
  set(collection, obj) {
    if (!obj || !obj.id) throw new Error('VersionedObject must have id');
    const col = this._ensureCollection(collection);
    const now = Game ? Game.time : 0;
    const dataField = Object.prototype.hasOwnProperty.call(obj, 'data') ? obj.data : obj;

    const versioned = {
      id: obj.id,
      createdTick: obj.createdTick || now,
      versionToken: this._makeVersionToken(dataField),
      valid: obj.valid !== false,
      data: dataField
    };

    // preserve previous version in history
    const existing = col[obj.id];
    if (existing) {
      if (!existing._history) existing._history = [];
      // store a shallow clone of previous version
      existing._history.unshift(Object.assign({}, existing));
      // truncate history
      if (existing._history.length > this.historySize) existing._history.length = this.historySize;
      // carry history forward
      versioned._history = existing._history.slice();
    } else {
      versioned._history = [];
    }

    col[obj.id] = versioned;
    return versioned;
  }

  /**
   * Lê objeto por ID
   */
  get(collection, id) {
    const col = this._ensureCollection(collection);
    const entry = col[id] || null;
    if (!entry) return null;
    // return shallow clone to avoid external mutation of internal store
    const copy = Object.assign({}, entry);
    copy._history = entry._history ? entry._history.slice() : [];
    return copy;
  }

  /**
   * Return version history for an object id in a collection
   * @param {string} collection
   * @param {string} id
   * @returns {Array} history entries (most-recent-first)
   */
  getHistory(collection, id) {
    const col = this._ensureCollection(collection);
    const entry = col[id];
    if (!entry) return [];
    return entry._history ? entry._history.slice() : [];
  }

  /**
   * Lista todos os objetos válidos em uma coleção
   */
  list(collection) {
    const col = this._ensureCollection(collection);
    return Object.values(col).filter(o => o && o.valid !== false);
  }

  /**
   * Remove objeto
   */
  delete(collection, id) {
    const col = this._ensureCollection(collection);
    delete col[id];
  }

  /**
   * Invalida objetos por predicado
   */
  invalidateWhere(collection, predicate) {
    const col = this._ensureCollection(collection);
    for (const id of Object.keys(col)) {
      try {
        if (predicate(col[id])) {
          // push previous into history before modifying
          const prev = Object.assign({}, col[id]);
          if (!prev._history) prev._history = [];
          prev._history.unshift(prev);

          col[id].valid = false;
          col[id].versionToken = this._makeVersionToken(col[id]);

          // ensure history size
          if (!col[id]._history) col[id]._history = [];
          col[id]._history.unshift(prev);
          if (col[id]._history.length > this.historySize) col[id]._history.length = this.historySize;
        }
      } catch (e) {
        // ignore predicate errors
      }
    }
  }
}
