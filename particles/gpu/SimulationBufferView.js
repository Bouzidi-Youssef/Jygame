const REVERSE_MAP = {
  x: "_x", y: "_y", vx: "_vx", vy: "_vy", ax: "_ax", ay: "_ay",
  life: "_life", maxLife: "_maxLife", ageRatio: "_ageRatio",
  rotation: "_rotation", rotationSpeed: "_rotationSpeed",
  size: "_size", alpha: "_alpha", depth: "_depth",
  r: "_r", g: "_g", b: "_b",
  id: "_id",
};

const SCALAR_FIELDS = [
  "x", "y", "vx", "vy", "ax", "ay",
  "life", "maxLife", "ageRatio",
  "rotation", "rotationSpeed",
  "size", "alpha", "depth",
];

const UINT8_FIELDS = ["r", "g", "b"];

export class SimulationBufferView {
  constructor(storage) {
    for (const [short, store] of Object.entries(REVERSE_MAP)) {
      this[store] = storage[store];
    }
  }

  _getBuf(field) {
    return this[REVERSE_MAP[field]];
  }

  get(i, field) {
    return this[REVERSE_MAP[field]][i];
  }

  set(i, field, value) {
    this[REVERSE_MAP[field]][i] = value;
  }

  id(i) {
    return this._id[i];
  }

  integrate(i, dt) {
    this._vx[i] += this._ax[i] * dt;
    this._vy[i] += this._ay[i] * dt;
    this._x[i] += this._vx[i] * dt;
    this._y[i] += this._vy[i] * dt;
    this._rotation[i] += this._rotationSpeed[i] * dt;
    this._life[i] -= dt;
    this._ageRatio[i] = this._maxLife[i] > 0
      ? Math.max(0, Math.min(1, 1 - this._life[i] / this._maxLife[i]))
      : 0;
  }
}

for (const name of SCALAR_FIELDS) {
  const bufName = REVERSE_MAP[name];
  const getter = function (i) { return this[bufName][i]; };
  const setter = function (i, v) { this[bufName][i] = v; };
  Object.defineProperty(SimulationBufferView.prototype, name, {
    value: getter, writable: true, configurable: true,
  });
  Object.defineProperty(SimulationBufferView.prototype, "set" + name[0].toUpperCase() + name.slice(1), {
    value: setter, writable: true, configurable: true,
  });
}

for (const name of UINT8_FIELDS) {
  const bufName = REVERSE_MAP[name];
  const getter = function (i) { return this[bufName][i]; };
  const setter = function (i, v) { this[bufName][i] = v; };
  Object.defineProperty(SimulationBufferView.prototype, name, {
    value: getter, writable: true, configurable: true,
  });
  Object.defineProperty(SimulationBufferView.prototype, "set" + name[0].toUpperCase() + name.slice(1), {
    value: setter, writable: true, configurable: true,
  });
}
