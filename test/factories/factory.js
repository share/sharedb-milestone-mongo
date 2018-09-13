class Factory {
  static base() { }

  static build(overrideFunction) {
    const instance = this.base();

    if (typeof overrideFunction === 'function') {
      overrideFunction(instance);
    }

    return instance;
  }
}

module.exports = Factory;
