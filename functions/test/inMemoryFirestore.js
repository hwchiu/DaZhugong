"use strict";

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

class DocumentSnapshot {
  constructor(ref, data) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = data !== undefined;
    this._data = clone(data);
  }

  data() {
    return clone(this._data);
  }

  get(field) {
    return clone(this._data?.[field]);
  }
}

class QuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
  }
}

class DocumentReference {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split("/").at(-1);
  }

  collection(name) {
    return new CollectionReference(this.db, `${this.path}/${name}`);
  }

  async get() {
    return this.db._snapshot(this.path, this.db._store);
  }

  async set(data, options) {
    this.db._write(this.db._store, this.path, data, options);
  }

  async update(data) {
    this.db._update(this.db._store, this.path, data);
  }
}

class Query {
  constructor(collection, filters = [], limitValue = Infinity) {
    this.collection = collection;
    this.filters = filters;
    this.limitValue = limitValue;
  }

  where(field, operator, value) {
    if (operator !== "==") {
      throw new Error(`Unsupported operator: ${operator}`);
    }
    return new Query(
      this.collection,
      [...this.filters, {field, value}],
      this.limitValue
    );
  }

  limit(value) {
    return new Query(this.collection, this.filters, value);
  }

  async get() {
    const prefix = `${this.collection.path}/`;
    const docs = [];

    for (const [path, data] of this.collection.db._store) {
      if (!path.startsWith(prefix) || path.slice(prefix.length).includes("/")) {
        continue;
      }
      if (!this.filters.every(({field, value}) => data[field] === value)) {
        continue;
      }
      docs.push(this.collection.db._snapshot(path, this.collection.db._store));
    }

    return new QuerySnapshot(docs.slice(0, this.limitValue));
  }
}

class CollectionReference extends Query {
  constructor(db, path) {
    super(null);
    this.db = db;
    this.path = path;
    this.collection = this;
    this.filters = [];
    this.limitValue = Infinity;
  }

  doc(id) {
    const documentId = id ?? `auto-${++this.db._nextId}`;
    return new DocumentReference(this.db, `${this.path}/${documentId}`);
  }
}

class Transaction {
  constructor(db, workingStore) {
    this.db = db;
    this.workingStore = workingStore;
  }

  async get(ref) {
    return this.db._snapshot(ref.path, this.workingStore);
  }

  set(ref, data, options) {
    this.db._write(this.workingStore, ref.path, data, options);
    return this;
  }

  update(ref, data) {
    this.db._update(this.workingStore, ref.path, data);
    return this;
  }
}

class InMemoryFirestore {
  constructor(seed = {}) {
    this._store = new Map(
      Object.entries(seed).map(([path, data]) => [path, clone(data)])
    );
    this._nextId = 0;
    this._transactionTail = Promise.resolve();
  }

  collection(name) {
    return new CollectionReference(this, name);
  }

  doc(path) {
    return new DocumentReference(this, path);
  }

  async runTransaction(callback) {
    const run = this._transactionTail.then(async () => {
      const workingStore = new Map(
        [...this._store].map(([path, data]) => [path, clone(data)])
      );
      const result = await callback(new Transaction(this, workingStore));
      this._store = workingStore;
      return result;
    });

    this._transactionTail = run.catch(() => undefined);
    return run;
  }

  read(path) {
    return clone(this._store.get(path));
  }

  list(prefix) {
    return [...this._store]
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, data]) => ({path, data: clone(data)}));
  }

  _snapshot(path, store) {
    return new DocumentSnapshot(new DocumentReference(this, path), store.get(path));
  }

  _write(store, path, data, options = {}) {
    const current = store.get(path);
    const base = options.merge && current ? current : {};
    store.set(path, this._applyTransforms({...clone(base), ...clone(data)}, current));
  }

  _update(store, path, data) {
    const current = store.get(path);
    if (!current) {
      throw new Error(`Missing document: ${path}`);
    }
    store.set(path, this._applyTransforms({...clone(current), ...clone(data)}, current));
  }

  _applyTransforms(next, current = {}) {
    for (const [field, value] of Object.entries(next)) {
      if (value && typeof value === "object" && value.__increment !== undefined) {
        next[field] = (current[field] ?? 0) + value.__increment;
      }
    }
    return next;
  }
}

module.exports = {InMemoryFirestore};
