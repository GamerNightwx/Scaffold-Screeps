/**
 * WorkingMemory - persistência versionada para Goals, Reservations, Templates
 * Armazena no Memory.workingMemory (objeto JSON serializável)
 * Cada objeto é um VersionedObject: { id, createdTick, versionToken, valid, data }
 */
export default class WorkingMemory {
  constructor() {
    if (!globalThis.Memory) globalThis.Memory = {};
    if (!Memory.workingMemory) Memory.workingMemory = { collections: {} };
    this.store = Memory.workingMemory.collections;
  }

  _ensureCollection(collection) {
    if (!this.store[collection]) this.store[collection] = {};
    return this.store[collection];
  }

  _makeVersionToken(obj) {
    // Simple token based on timestamp + JSON length
    try {
      return `${Date.now()}-${JSON.stringify(obj).length}`;
    } catch (e) {
      return `${Date.now()}-0`;
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
    const versioned = {
      id: obj.id,
      createdTick: obj.createdTick || now,
      versionToken: this._makeVersionToken(obj.data || obj),
      valid: obj.valid !== false,
      data: obj.data || obj.data === undefined ? obj.data : obj
    };
    col[obj.id] = versioned;
    return versioned;
  }

  /**
   * Lê objeto por ID
   */
  get(collection, id) {
    const col = this._ensureCollection(collection);
    return col[id] || null;
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
          col[id].valid = false;
          col[id].versionToken = this._makeVersionToken(col[id]);
        }
      } catch (e) {
        // ignore predicate errors
      }
    }
  }
}
