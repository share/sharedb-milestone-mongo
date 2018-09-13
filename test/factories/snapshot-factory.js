const Factory = require('./factory');

class SnapshotFactory extends Factory {
  static base() {
    return {
      id: 'abc',
      v: 0,
      type: 'json0',
      data: null,
      m: null,
    };
  }
}

module.exports = SnapshotFactory;
