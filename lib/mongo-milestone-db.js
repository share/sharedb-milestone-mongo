const MilestoneDB = require('sharedb').MilestoneDB;
const mongodb = require('mongodb');

class MongoMilestoneDB extends MilestoneDB {
  constructor(mongo, options) {
    if (typeof mongo === 'object') {
      options = mongo;
      mongo = options.mongo;
    }

    options = options || {};
    super(options);

    this.interval = this.interval || 1000;

    this._disableIndexCreation = options.disableIndexCreation;
    this._milestoneIndexes = new Set();

    delete options.mongo;
    delete options.interval;
    delete options.disableIndexCreation;
    this._mongo = MongoMilestoneDB._connect(mongo, options);
  }

  close(callback) {
    if (!callback) callback = () => { };

    this._close()
      .then(() => process.nextTick(callback))
      .catch(error => process.nextTick(callback, error));
  }

  saveMilestoneSnapshot(collectionName, snapshot, callback) {
    let wasSaved = false;

    if (!callback) {
      callback = (error) => {
        error ? this.emit('error', error) : this.emit('save', wasSaved, collectionName, snapshot);
      };
    }

    if (!snapshot) return process.nextTick(callback, null, wasSaved, collectionName, snapshot);

    this._saveMilestoneSnapshot(collectionName, snapshot)
      .then(() => {
        wasSaved = true;
        process.nextTick(callback, null, wasSaved);
      })
      .catch(error => process.nextTick(callback, error));
  }

  getMilestoneSnapshot(collectionName, id, version, callback) {
    this._getMilestoneSnapshot(collectionName, id, version)
      .then(snapshot => process.nextTick(callback, null, snapshot))
      .catch(error => process.nextTick(callback, error));
  }

  _saveMilestoneSnapshot(collectionName, snapshot) {
    return this._collection(collectionName)
      .then((collection) => {
        const query = { id: snapshot.id, v: snapshot.v };
        const doc = MongoMilestoneDB._shallowClone(snapshot);
        const options = { upsert: true };

        return collection.updateOne(query, doc, options);
      });
  }

  _getMilestoneSnapshot(collectionName, id, version) {
    return this._collection(collectionName)
      .then((collection) => {
        const query = { id: id };
        if (version !== null) {
          query.v = { $lte: version };
        }

        return collection
          .find(query)
          .project({ _id: 0 })
          .sort({ v: -1 })
          .limit(1)
          .next();
      })
      .then((snapshot) => {
        if (snapshot) {
          snapshot.m = snapshot.m == null ? null : snapshot.m;
        }

        return snapshot || undefined;
      });
  }

  _close() {
    return this._db()
      .then((db) => {
        this._mongo = null;
        return db.close();
      });
  }

  _db() {
    if (!this._mongo) {
      return Promise.reject(new MongoClosedError());
    }

    return this._mongo;
  }

  _collection(collectionName) {
    let name;
    let collection;

    return this._db()
      .then((db) => {
        name = MongoMilestoneDB._milestoneCollectionName(collectionName);
        collection = db.collection(name);

        if (this._shouldCreateIndex(name)) {
          // WARNING: Creating indexes automatically like this is quite dangerous in
          // production if we are starting with a lot of data and no indexes
          // already. If new indexes were added or definition of these indexes were
          // changed, users upgrading this module could unsuspectingly lock up their
          // databases. If indexes are created as the first ops are added to a
          // collection this won't be a problem, but this is a dangerous mechanism.
          // Perhaps we should only warn instead of creating the indexes, especially
          // when there is a lot of data in the collection.
          return collection.createIndex({ id: 1, v: 1 }, { background: true, unique: true });
        }

        return Promise.resolve();
      })
      .then(() => {
        if (!this._disableIndexCreation) {
          this._milestoneIndexes.add(name);
        }

        return collection;
      });
  }

  _shouldCreateIndex(milestoneCollectionName) {
    // Given the potential problems with creating indexes on the fly, it might
    // be preferable to disable automatic creation
    return !this._disableIndexCreation
      && !this._milestoneIndexes.has(milestoneCollectionName);
  }

  static _milestoneCollectionName(collectionName) {
    return `m_${ collectionName }`;
  }

  static _connect(mongo, options) {
    if (typeof mongo === 'function') {
      return new Promise((resolve, reject) => {
        mongo((error, db) => {
          error ? reject(error) : resolve(db);
        });
      });
    }

    return mongodb.connect(mongo, options);
  }

  static _shallowClone(object) {
    const out = {};
    for (const key in object) {
      out[key] = object[key];
    }
    return out;
  }
}

class MongoClosedError extends Error {
  constructor() {
    super();
    this.code = 5101;
    this.message = 'Already closed';
  }
}

module.exports = MongoMilestoneDB;
