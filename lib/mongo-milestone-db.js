const MilestoneDB = require('sharedb').MilestoneDB;
const mongodb = require('mongodb');

class MongoMilestoneDB extends MilestoneDB {
  constructor(mongo, options) {
    if (typeof mongo === 'object') {
      options = mongo;
      mongo = options.mongo;
    }

    // Shallow clone because we delete options later on
    options = MongoMilestoneDB._shallowClone(options) || {};
    super(options);

    this.interval = this.interval || 1000;

    this._disableIndexCreation = options.disableIndexCreation;
    this._milestoneIndexes = new Set();

    // Since we pass our options object straight through to Mongo, we need to remove any non-Mongo
    // options, because these throw warnings, or can even break the connection if setting the
    // validateOptions flag.
    // See: https://github.com/mongodb/node-mongodb-native/blob/bd4fb531a7f599bb6cf50ebbab3b986f191a7ef8/lib/mongo_client.js#L53-L57
    delete options.mongo;
    delete options.interval;
    delete options.disableIndexCreation;
    this._mongoPromise = MongoMilestoneDB._connect(mongo, options);
  }

  close(callback) {
    if (!callback) callback = () => { };

    this._close()
      .then(() => process.nextTick(callback))
      .catch(error => process.nextTick(callback, error));
  }

  saveMilestoneSnapshot(collectionName, snapshot, callback) {
    if (!callback) {
      callback = (error) => {
        if (error) {
          this.emit('error', error);
        } else {
          this.emit('save', collectionName, snapshot);
        }
      };
    }

    if (!collectionName) return process.nextTick(callback, new InvalidCollectionNameError());
    if (!snapshot) return process.nextTick(callback, new InvalidSnapshotError());

    this._saveMilestoneSnapshot(collectionName, snapshot)
      .then(() => {
        process.nextTick(callback, null);
      })
      .catch(error => process.nextTick(callback, error));
  }

  getMilestoneSnapshot(collectionName, id, version, callback) {
    this._getMilestoneSnapshotByVersion(collectionName, id, version)
      .then(snapshot => process.nextTick(callback, null, snapshot))
      .catch(error => process.nextTick(callback, error));
  }

  getMilestoneSnapshotAtOrBeforeTime(collection, id, timestamp, callback) {
    const isAfterTimestamp = false;
    this._getMilestoneSnapshotByTimestamp(collection, id, timestamp, isAfterTimestamp)
      .then(snapshot => process.nextTick(callback, null, snapshot))
      .catch(error => process.nextTick(callback, error));
  }

  getMilestoneSnapshotAtOrAfterTime(collection, id, timestamp, callback) {
    const isAfterTimestamp = true;
    this._getMilestoneSnapshotByTimestamp(collection, id, timestamp, isAfterTimestamp)
      .then(snapshot => process.nextTick(callback, null, snapshot))
      .catch(error => process.nextTick(callback, error));
  }

  _saveMilestoneSnapshot(collectionName, snapshot) {
    return this._collection(collectionName)
      .then((collection) => {
        const query = {d: snapshot.id, v: snapshot.v};
        const updatedSnapshot = MongoMilestoneDB._snapshotToDbRepresentation(snapshot);
        const options = {upsert: true};

        return collection.updateOne(query, updatedSnapshot, options);
      });
  }

  _getMilestoneSnapshotByVersion(collectionName, id, version) {
    if (!id) return Promise.reject(new InvalidIdError());
    if (!this._isValidVersion(version)) {
      return Promise.reject(new InvalidVersionError());
    }

    const query = {d: id};
    if (version != null) {
      query.v = {$lte: version};
    }

    const options = {
      sort: {v: -1},
    };

    return this._getMilestoneSnapshotByQuery(collectionName, query, options);
  }

  _getMilestoneSnapshotByTimestamp(collectionName, id, timestamp, isAfterTimestamp) {
    if (!id) return Promise.reject(new InvalidIdError());
    if (!this._isValidTimestamp(timestamp)) {
      return Promise.reject(new InvalidTimestampError());
    }

    const nullSortOrder = isAfterTimestamp ? -1 : 1;

    const query = {d: id};
    const options = {
      limit: 1,
      sort: {'m.mtime': nullSortOrder},
    };

    if (timestamp !== null) {
      const comparator = isAfterTimestamp ? {$gte: timestamp} : {$lte: timestamp};
      query['m.mtime'] = comparator;
      options.sort['m.mtime'] = -nullSortOrder;
    }

    return this._getMilestoneSnapshotByQuery(collectionName, query, options);
  }

  _getMilestoneSnapshotByQuery(collectionName, query, options) {
    if (!collectionName) return Promise.reject(new InvalidCollectionNameError());

    return this._collection(collectionName)
      .then(collection => collection.findOne(query, options))
      .then(MongoMilestoneDB._databaseRepresentationToSnapshot);
  }

  _close() {
    return this._db()
      .then((db) => {
        this._mongoPromise = null;
        return db.close();
      });
  }

  _db() {
    if (!this._mongoPromise) {
      return Promise.reject(new MongoClosedError());
    }

    return this._mongoPromise;
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
          return Promise.all([
            collection.createIndex({d: 1, v: 1}, {background: true, unique: true}),
            collection.createIndex({'m.mtime': 1}, {background: true}),
          ]);
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

  static _snapshotToDbRepresentation(snapshot) {
    const databaseRepresentation = MongoMilestoneDB._shallowClone(snapshot);
    databaseRepresentation.d = databaseRepresentation.id;
    delete databaseRepresentation.id;

    return databaseRepresentation;
  }

  static _databaseRepresentationToSnapshot(databaseRepresentation) {
    if (!databaseRepresentation) {
      return undefined;
    }

    const snapshot = MongoMilestoneDB._shallowClone(databaseRepresentation);
    snapshot.m = snapshot.m == null ? null : snapshot.m;
    snapshot.id = snapshot.d;

    delete snapshot._id;
    delete snapshot.d;

    return snapshot;
  }

  static _shallowClone(object) {
    if (typeof object !== 'object') return object;
    return Object.assign({}, object);
  }
}

class InvalidCollectionNameError extends Error {
  constructor() {
    super();
    this.code = 4101;
    this.message = 'Must provide valid collection name';
  }
}

class InvalidIdError extends Error {
  constructor() {
    super();
    this.code = 4102;
    this.message = 'Must provide valid ID';
  }
}

class InvalidSnapshotError extends Error {
  constructor() {
    super();
    this.code = 4103;
    this.message = 'Must provide valid snapshot';
  }
}

class InvalidVersionError extends Error {
  constructor() {
    super();
    this.code = 4104;
    this.message = 'Must provide valid integer version or null';
  }
}

class InvalidTimestampError extends Error {
  constructor() {
    super();
    this.code = 4105;
    this.message = 'Must provide valid integer timestamp or null';
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
