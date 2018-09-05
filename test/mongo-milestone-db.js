const expect = require('expect.js');
const mongodb = require('mongodb');
const MongoMilestoneDB = require('../lib/mongo-milestone-db');
const SnapshotFactory = require('./factories/snapshot-factory');

const MONGO_URL = process.env.TEST_MONGO_URL || 'mongodb://localhost:27017/test';

function create(options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  let db;

  options = Object.assign({
    mongo: (shareDbCallback) => {
      let mongo;

      mongodb.connect(MONGO_URL)
        .then((mongoConnection) => {
          mongo = mongoConnection;
          return mongo.dropDatabase();
        })
        .then(() => {
          shareDbCallback(null, mongo);
          callback(null, db, mongo);
        });
    },
  }, options);

  db = new MongoMilestoneDB(options);
}

require('sharedb/test/milestone-db')({create: create});

describe('MongoMilestoneDB', () => {
  describe('with a mongo callback', () => {
    let db;
    let mongo;

    beforeEach((done) => {
      create((error, createdDb, createdMongo) => {
        if (error) return done(error);
        db = createdDb;
        mongo = createdMongo;
        done();
      });
    });

    afterEach((done) => {
      if (db._mongoPromise) return db.close(done);
      done();
    });

    it('overwrites an existing milestone snapshot', (done) => {
      const id = 'abc';
      const collection = 'testcollection';
      const version = 1;

      const snapshot1 = SnapshotFactory.build((snapshot) => {
        snapshot.id = id;
        snapshot.v = version;
        snapshot.data = {foo: 'bar'};
      });

      const snapshot2 = SnapshotFactory.build((snapshot) => {
        snapshot.id = id;
        snapshot.v = version;
        snapshot.data = {foo: 'baz'};
      });

      db.saveMilestoneSnapshot(collection, snapshot1, (saveError1) => {
        if (saveError1) return done(saveError1);
        db.getMilestoneSnapshot(collection, id, 1, (getError1, retrievedSnapshot1) => {
          if (getError1) return done(getError1);
          expect(retrievedSnapshot1).to.eql(snapshot1);
          db.saveMilestoneSnapshot(collection, snapshot2, (saveError2) => {
            if (saveError2) return done(saveError2);
            db.getMilestoneSnapshot(collection, id, 1, (getError2, retrievedSnapshot2) => {
              if (getError2) return done(getError2);
              expect(retrievedSnapshot2).to.eql(snapshot2);
              done();
            });
          });
        });
      });
    });

    it('adds an index for the snapshots', (done) => {
      const snapshot = SnapshotFactory.build();

      db.saveMilestoneSnapshot('testcollection', snapshot, (saveError) => {
        if (saveError) return done(saveError);
        mongo.collection('m_testcollection').indexInformation((indexError, indexes) => {
          if (indexError) return done(indexError);
          expect(indexes.d_1_v_1).to.be.ok();
          done();
        });
      });
    });

    it('errors when trying to access a database that is closed', (done) => {
      db.close((closeError) => {
        if (closeError) return done(closeError);
        db.getMilestoneSnapshot('testcollection', 'abc', null, (getError) => {
          expect(getError).to.be.ok();
          done();
        });
      });
    });

    it('defaults to an interval of 1000', () => {
      expect(db.interval).to.be(1000);
    });
  });

  describe('indexing disabled', () => {
    let db;
    let mongo;

    beforeEach((done) => {
      const options = {
        disableIndexCreation: true,
      };

      create(options, (error, createdDb, createdMongo) => {
        if (error) return done(error);
        db = createdDb;
        mongo = createdMongo;
        done();
      });
    });

    afterEach((done) => {
      db.close(done);
    });

    it('does not add an index for milestones', (done) => {
      const snapshot = SnapshotFactory.build();

      db.saveMilestoneSnapshot('testcollection', snapshot, (saveError) => {
        if (saveError) return done(saveError);
        mongo.collection('m_testcollection').indexInformation((indexError, indexes) => {
          if (indexError) return done(indexError);
          expect(indexes.id_1_v_1).not.to.be.ok();
          done();
        });
      });
    });
  });

  describe('connecting using just URL', () => {
    let db;

    beforeEach(() => {
      db = new MongoMilestoneDB(MONGO_URL);
      return db._mongoPromise.then(mongo => mongo.dropDatabase());
    });

    afterEach((done) => {
      db.close(done);
    });

    it('can save and fetch milestones', (done) => {
      const collection = 'testcollection';
      const snapshot = SnapshotFactory.build();

      db.saveMilestoneSnapshot(collection, snapshot, (saveError) => {
        if (saveError) return done(saveError);
        db.getMilestoneSnapshot(collection, snapshot.id, null, (getError, retrievedSnapshot) => {
          if (getError) return done(getError);
          expect(retrievedSnapshot).to.eql(snapshot);
          done();
        });
      });
    });
  });

  describe('a mocked out database that throws all the time', () => {
    let db;

    beforeEach(() => {
      const mockMongo = {
        close: () => {
          throw new Error('Mock: could not close');
        },
        collection: () => {
          throw new Error('Mock: could not get collection');
        },
      };

      db = new MongoMilestoneDB({
        mongo: (callback) => {
          callback(null, mockMongo);
        },
      });
    });

    it('returns a callback with error on close error', (done) => {
      db.close((error) => {
        expect(error).to.be.ok();
        done();
      });
    });

    it('emits an error when saving with no callback', (done) => {
      const snapshot = SnapshotFactory.build();
      db.on('error', (error) => {
        expect(error).to.be.ok();
        done();
      });

      db.saveMilestoneSnapshot('testcollection', snapshot);
    });
  });

  describe('a bad config', () => {
    it('throws when accessing', (done) => {
      const options = {
        mongo: (callback) => {
          callback(new Error('Mock: could not connect'));
        },
      };

      const db = new MongoMilestoneDB(options);
      db.getMilestoneSnapshot('testcollection', 'abc', null, (error) => {
        expect(error).to.be.ok();
        done();
      });
    });
  });

  describe('overriding the interval', () => {
    let db;

    beforeEach(() => {
      const options = {interval: 100};
      db = new MongoMilestoneDB(MONGO_URL, options);
      return db._mongoPromise.then(mongo => mongo.dropDatabase());
    });

    afterEach((done) => {
      db.close(done);
    });

    it('has its interval overridden', () => {
      expect(db.interval).to.be(100);
    });
  });
});
