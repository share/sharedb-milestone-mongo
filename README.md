# sharedb-milestone-mongo

[![NPM Version](https://img.shields.io/npm/v/sharedb-milestone-mongo.svg)](https://npmjs.org/package/sharedb-milestone-mongo)
[![Build Status](https://travis-ci.org/share/sharedb-milestone-mongo.svg?branch=master)](https://travis-ci.org/share/sharedb-milestone-mongo.svg?branch=master)
[![Coverage Status](https://coveralls.io/repos/github/share/sharedb-milestone-mongo/badge.svg?branch=master)](https://coveralls.io/github/share/sharedb-milestone-mongo?branch=master)

MongoDB milestone snapshot database adapter for [`sharedb`][1]. Milestone snapshots can be used to speed up the results
of ShareDB's `connection.fetchSnapshot` method by providing points in time on top of which a smaller number of ops can
be applied to reach the requested version.

Milestone snapshots will be stored in a collection called `m_COLLECTION` where `COLLECTION` is the name of your ShareDB
collection.

## Quick start

```javascript
const MongoMilestoneDB = require('sharedb-milestone-mongo');
const ShareDB = require('sharedb');

const milestoneDb = new MongoMilestoneDB('mongodb://localhost:27017/test');
const shareDb = new ShareDB({ milestoneDb: milestoneDb });
```

## Configuration

### Mongo

The underlying Mongo database can be configured in a number of ways. This library wraps v2 of the [`mongodb`][2]
library, so any configuration that can be used there can be used in this library.

Mongo can be configured simply using a connection string and any desired [options][3]:

```javascript
const milestoneDb = new MongoMilestoneDB('mongodb://localhost:27017/test', { loggerLevel: 'debug' });
```

It can also be configured with a callback that provides an instance of a Mongo [`Db` object][4]:

```javascript
const mongodb = require('mongodb');

const milestoneDb = new MongoMilestoneDB((callback) => {
  mongodb.connect('mongodb://localhost:27017/test', callback);
});
```

The Mongo connection string or function can be used as the first argument of the constructor, or as part of an options
object:

```javascript
const milestoneDb = new MongoMilestoneDB({
  mongo: 'mongodb://localhost:27017/test',
  loggerLevel: 'debug',
});
```

### Milestone snapshot saving

#### Intervals

By default, ShareDB will save a milestone snapshot with a given frequency. This library defaults to an interval of
1,000, saving milestones when the 1,000th, 2,000th, etc. versions are committed. That default interval can be
configured:

```javascript
const milestoneDb = new MongoMilestoneDB({
  mongo: 'mongodb://localhost:27017/test',
  interval: 500,
});
```

#### Complex saving logic

If you need more complex saving logic (eg different intervals depending on collection), this can be achieved using
ShareDB middleware:

```javascript
const milestoneDb = new MongoMilestoneDB('mongodb://localhost:27017/test');
const shareDb = new ShareDB({ milestoneDb: milestoneDb });

shareDb.use('commit', (request, callback) => {
  switch (request.collection) {
    case 'foo':
      // Save every 100 versions for collection 'foo'
      request.saveMilestoneSnapshot = request.snapshot.v % 100 === 0;
      break;
    case 'bar':
    case 'baz':
      // Save every 500 versions for collections 'bar' and 'baz'
      request.saveMilestoneSnapshot = request.snapshot.v % 500 === 0;
      break;
    default:
      // Don't save any milestones for collections not named here.
      // IMPORTANT: We have to set this to false to actively disable milestones
      // If left to null, then the default interval will still apply
      request.saveMilestoneSnapshot = false;
  }

  callback();
});
```

Note that the default value of `request.saveMilestoneSnapshot` is `null`. If left to this value, it will use the default
interval logic. If you want to actively disable snapshots, you must make sure to set it to `false`.

### Indexing

By default, indexing is enabled on the milestone collections in order to speed up fetching. This can have an adverse
impact on performance if being enabled on an existing collection that is missing the index. The indexing can be
disabled:

```javascript
const milestoneDb = new MongoMilestoneDB({
  mongo: 'mongodb://localhost:27017/test',
  disableIndexCreation: true,
});
```

## Error codes

### 4100 - Bad request - DB

* 4101 - Must provide valid collection name
* 4102 - Must provide valid ID
* 4103 - Must provide valid snapshot
* 4104 - Must provide valid integer version

### 5100 - Internal error - DB

* 5101 - Mongo closed


[1]: https://github.com/share/sharedb
[2]: https://mongodb.github.io/node-mongodb-native/
[3]: http://mongodb.github.io/node-mongodb-native/2.2/api/MongoClient.html#connect
[4]: http://mongodb.github.io/node-mongodb-native/2.2/api/Db.html
