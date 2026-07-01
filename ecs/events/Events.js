import { EventChannel } from "./EventChannel.js";

export class Events {
  constructor() {
    this._channels = new Map();
  }

  register(eventClass, options = {}) {
    if (this._channels.has(eventClass)) {
      throw new Error(
        `Events.register failed: "${eventClass.name}" is already registered.`
      );
    }
    if (!Array.isArray(eventClass.fields)) {
      throw new TypeError(
        `Events.register failed: "${eventClass.name}" must define a static "fields" array.`
      );
    }
    const capacity = options.capacity ?? eventClass.capacity ?? 2048;
    const channel = new EventChannel(capacity, eventClass.fields);
    this._channels.set(eventClass, channel);
  }

  emit(eventClass, data) {
    const channel = this._channels.get(eventClass);
    if (!channel) {
      throw new Error(
        `Events.emit failed: "${eventClass.name}" is not registered. ` +
        `Call world.registerEvent() before emitting.`
      );
    }
    channel.emit(data);
  }

  read(eventClass) {
    const channel = this._channels.get(eventClass);
    if (!channel) {
      throw new Error(
        `Events.read failed: "${eventClass.name}" is not registered. ` +
        `Call world.registerEvent() before reading.`
      );
    }
    return channel.read();
  }

  clear() {
    for (const channel of this._channels.values()) {
      channel.clear();
    }
  }
}
