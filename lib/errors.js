class InvalidCollectionNameError extends Error {
  constructor() {
    super();
    this.code = 'ERR_INVALID_COLLECTION_NAME';
    this.message = 'Must provide valid collection name';
  }
}

class InvalidIdError extends Error {
  constructor() {
    super();
    this.code = 'ERR_INVALID_ID';
    this.message = 'Must provide valid ID';
  }
}

class InvalidSnapshotError extends Error {
  constructor() {
    super();
    this.code = 'ERR_INVALID_SNAPSHOT';
    this.message = 'Must provide valid snapshot';
  }
}

class InvalidVersionError extends Error {
  constructor() {
    super();
    this.code = 'ERR_INVALID_VERSION';
    this.message = 'Must provide valid integer version or null';
  }
}

class InvalidTimestampError extends Error {
  constructor() {
    super();
    this.code = 'ERR_INVALID_TIMESTAMP';
    this.message = 'Must provide valid integer timestamp or null';
  }
}

class MongoClosedError extends Error {
  constructor() {
    super();
    this.code = 'MONGO_CLOSED';
    this.message = 'Already closed';
  }
}

module.exports = {
  InvalidCollectionNameError,
  InvalidIdError,
  InvalidSnapshotError,
  InvalidVersionError,
  InvalidTimestampError,
  MongoClosedError,
};
