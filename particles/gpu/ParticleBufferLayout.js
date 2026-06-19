let _frozen = false;

const FIELD_NAMES = [
  "x", "y", "vx", "vy", "ax", "ay",
  "life", "maxLife", "ageRatio",
  "rotation", "rotationSpeed",
  "size", "alpha", "depth",
  "r", "g", "b",
];

const FIELD_INDEX = {};
for (let i = 0; i < FIELD_NAMES.length; i++) {
  FIELD_INDEX[FIELD_NAMES[i]] = i;
}

const STRIDE = FIELD_NAMES.length;

export class ParticleBufferLayout {
  static get FIELD_NAMES() {
    return FIELD_NAMES;
  }

  static get FIELD_INDEX() {
    return FIELD_INDEX;
  }

  static get STRIDE() {
    return STRIDE;
  }

  static get fields() {
    return FIELD_NAMES;
  }

  static get fieldIndex() {
    return FIELD_INDEX;
  }

  static get stride() {
    return STRIDE;
  }

  static indexOf(fieldName) {
    return FIELD_INDEX[fieldName];
  }

  static isValidField(name) {
    return name in FIELD_INDEX;
  }

  static registerField(name) {
    if (_frozen) {
      throw new Error("ParticleBufferLayout cannot be modified after first access");
    }
    if (name in FIELD_INDEX) return;
    FIELD_NAMES.push(name);
    FIELD_INDEX[name] = FIELD_NAMES.length - 1;
  }

  static freeze() {
    _frozen = true;
  }
}
