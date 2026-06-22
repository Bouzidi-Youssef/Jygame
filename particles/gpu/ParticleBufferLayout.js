const FIELD_NAMES = [
  "x", "y", "vx", "vy", "ax", "ay",
  "life", "maxLife", "ageRatio",
  "rotation", "rotationSpeed",
  "size", "alpha", "depth",
  "r", "g", "b",
  "alive",
  "seed",
  "segment",
];

const FIELD_INDEX = {};
for (let i = 0; i < FIELD_NAMES.length; i++) {
  FIELD_INDEX[FIELD_NAMES[i]] = i;
}

const U32_FIELDS = new Set(["r", "g", "b", "alive", "segment"]);

export class ParticleBufferLayout {
  static get FIELD_NAMES() {
    return FIELD_NAMES;
  }

  static get FIELD_INDEX() {
    return FIELD_INDEX;
  }

  static get STRIDE() {
    return FIELD_NAMES.length;
  }

  static get fields() {
    return FIELD_NAMES;
  }

  static get fieldIndex() {
    return FIELD_INDEX;
  }

  static get stride() {
    return FIELD_NAMES.length;
  }

  static indexOf(fieldName) {
    return FIELD_INDEX[fieldName];
  }

  static isValidField(name) {
    return name in FIELD_INDEX;
  }

  static isU32Field(name) {
    return U32_FIELDS.has(name);
  }
}
