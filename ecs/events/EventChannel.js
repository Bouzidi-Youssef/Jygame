export class EventChannel {
  constructor(capacity, fields) {
    this._fields = fields;
    this._count = 0;
    this._capacity = capacity;
    this._buffer = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      const obj = {};
      for (let f = 0; f < fields.length; f++) {
        obj[fields[f]] = undefined;
      }
      this._buffer[i] = obj;
    }

    const self = this;
    this._iterator = {
      _i: 0,
      next() {
        if (this._i < self._count) {
          return { value: self._buffer[this._i++], done: false };
        }
        return { value: undefined, done: true };
      },
    };
  }

  [Symbol.iterator]() {
    this._iterator._i = 0;
    return this._iterator;
  }

  read() {
    return this;
  }

  emit(data) {
    if (this._count >= this._capacity) {
      this._grow();
    }
    const slot = this._buffer[this._count++];
    for (let i = 0; i < this._fields.length; i++) {
      const field = this._fields[i];
      slot[field] = data[field];
    }
  }

  clear() {
    this._count = 0;
  }

  get count() {
    return this._count;
  }

  get capacity() {
    return this._capacity;
  }

  _grow() {
    const newCapacity = this._capacity * 2;
    const newBuffer = new Array(newCapacity);
    for (let i = 0; i < this._capacity; i++) {
      newBuffer[i] = this._buffer[i];
    }
    for (let i = this._capacity; i < newCapacity; i++) {
      const obj = {};
      for (let f = 0; f < this._fields.length; f++) {
        obj[this._fields[f]] = undefined;
      }
      newBuffer[i] = obj;
    }
    this._buffer = newBuffer;
    this._capacity = newCapacity;
  }
}
