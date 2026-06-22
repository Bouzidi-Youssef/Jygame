import { WebGpuDeviceManager } from "./WebGpuDeviceManager.js";
import { ParticleBufferLayout } from "../ParticleBufferLayout.js";

const FLOAT_FIELDS = ParticleBufferLayout.FIELD_NAMES.filter(n => !ParticleBufferLayout.isU32Field(n));
const UINT_FIELDS = ParticleBufferLayout.FIELD_NAMES.filter(n => ParticleBufferLayout.isU32Field(n));
const STRIDE = ParticleBufferLayout.STRIDE;
const FLOAT_BYTES = 4;

export class GpuParticleBuffer {
  constructor(capacity = 1024) {
    this._capacity = capacity;
    this._device = WebGpuDeviceManager.device();
    this._buffer = null;
    this._stagingBuffer = null;
    this._byteSize = 0;
    this._allocate(capacity);
  }

  _allocate(capacity) {
    const device = this._device;
    const byteSize = STRIDE * capacity * FLOAT_BYTES;
    this._byteSize = byteSize;

    this._buffer = device.createBuffer({
      size: byteSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: `GpuParticleBuffer_${capacity}`,
    });

    this._stagingBuffer = device.createBuffer({
      size: byteSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      label: `GpuParticleStaging_${capacity}`,
    });

    this._capacity = capacity;
  }

  upload(storage) {
    const device = this._device;
    const capacity = this._capacity;
    const floatCount = STRIDE * capacity;

    const data = new Float32Array(floatCount);

    const count = storage.activeCount;
    storage.fillUploadBuffer(data, count, 0);

    device.queue.writeBuffer(this._buffer, 0, data.buffer, 0, floatCount * FLOAT_BYTES);
  }

  uploadDirty(storage) {
    if (!storage.isDirty) return;

    const device = this._device;
    const minIdx = storage.dirtyMin;
    const maxIdx = storage.dirtyMax;
    const rangeLength = maxIdx - minIdx + 1;
    const floatCount = STRIDE * rangeLength;

    const data = new Float32Array(floatCount);

    storage.fillUploadBuffer(data, rangeLength, minIdx);

    device.queue.writeBuffer(
      this._buffer,
      minIdx * STRIDE * FLOAT_BYTES,
      data.buffer,
      0,
      floatCount * FLOAT_BYTES,
    );

    storage.clearDirty();
  }

  _writeSlotData(slotIndex, storage) {
    const { _x, _y, _vx, _vy, _ax, _ay, _life, _maxLife, _ageRatio,
            _rotation, _rotationSpeed, _size, _alpha, _depth,
            _r, _g, _b, _alive, _seed, _segment } = storage;
    const i = slotIndex;
    const data = new Float32Array(STRIDE);
    data[0]  = _x[i];
    data[1]  = _y[i];
    data[2]  = _vx[i];
    data[3]  = _vy[i];
    data[4]  = _ax[i];
    data[5]  = _ay[i];
    data[6]  = _life[i];
    data[7]  = _maxLife[i];
    data[8]  = _ageRatio[i];
    data[9]  = _rotation[i];
    data[10] = _rotationSpeed[i];
    data[11] = _size[i];
    data[12] = _alpha[i];
    data[13] = _depth[i];
    data[14] = _r[i];
    data[15] = _g[i];
    data[16] = _b[i];
    data[17] = _alive[i];
    data[18] = _seed[i];
    data[19] = _segment[i];
    return data;
  }

  writeSlot(slotIndex, storage) {
    const data = this._writeSlotData(slotIndex, storage);
    const byteOffset = slotIndex * STRIDE * FLOAT_BYTES;
    this._device.queue.writeBuffer(this._buffer, byteOffset, data.buffer, 0, STRIDE * FLOAT_BYTES);
  }

  _writeSlotsSimple(slotIndices, storage) {
    const count = slotIndices.length;
    const { _x, _y, _vx, _vy, _ax, _ay, _life, _maxLife, _ageRatio,
            _rotation, _rotationSpeed, _size, _alpha, _depth,
            _r, _g, _b, _alive, _seed, _segment } = storage;
    const buf = this._buffer;
    const frame = new Float32Array(STRIDE);
    for (let j = 0; j < count; j++) {
      const i = slotIndices[j];
      frame[0]  = _x[i];
      frame[1]  = _y[i];
      frame[2]  = _vx[i];
      frame[3]  = _vy[i];
      frame[4]  = _ax[i];
      frame[5]  = _ay[i];
      frame[6]  = _life[i];
      frame[7]  = _maxLife[i];
      frame[8]  = _ageRatio[i];
      frame[9]  = _rotation[i];
      frame[10] = _rotationSpeed[i];
      frame[11] = _size[i];
      frame[12] = _alpha[i];
      frame[13] = _depth[i];
      frame[14] = _r[i];
      frame[15] = _g[i];
      frame[16] = _b[i];
      frame[17] = _alive[i];
      frame[18] = _seed[i];
      frame[19] = _segment[i];
      const byteOffset = i * STRIDE * FLOAT_BYTES;
      this._device.queue.writeBuffer(buf, byteOffset, frame.buffer, 0, STRIDE * FLOAT_BYTES);
    }
  }

  _writeSlotsBatched(slotIndices, storage) {
    const count = slotIndices.length;
    const { _x, _y, _vx, _vy, _ax, _ay, _life, _maxLife, _ageRatio,
            _rotation, _rotationSpeed, _size, _alpha, _depth,
            _r, _g, _b, _alive, _seed, _segment } = storage;
    const buf = this._buffer;

    // Copy and sort slot indices to find contiguous ranges
    const slots = new Uint32Array(slotIndices);
    slots.sort();
    slotIndices = null; // avoid accidental use

    // Pack all particle data into a single buffer (sorted by slot index)
    const totalData = new Float32Array(count * STRIDE);
    for (let j = 0; j < count; j++) {
      const i = slots[j];
      const base = j * STRIDE;
      totalData[base + 0]  = _x[i];
      totalData[base + 1]  = _y[i];
      totalData[base + 2]  = _vx[i];
      totalData[base + 3]  = _vy[i];
      totalData[base + 4]  = _ax[i];
      totalData[base + 5]  = _ay[i];
      totalData[base + 6]  = _life[i];
      totalData[base + 7]  = _maxLife[i];
      totalData[base + 8]  = _ageRatio[i];
      totalData[base + 9]  = _rotation[i];
      totalData[base + 10] = _rotationSpeed[i];
      totalData[base + 11] = _size[i];
      totalData[base + 12] = _alpha[i];
      totalData[base + 13] = _depth[i];
      totalData[base + 14] = _r[i];
      totalData[base + 15] = _g[i];
      totalData[base + 16] = _b[i];
      totalData[base + 17] = _alive[i];
      totalData[base + 18] = _seed[i];
      totalData[base + 19] = _segment[i];
    }

    // Find contiguous ranges and write each with one writeBuffer call
    const strideBytes = STRIDE * FLOAT_BYTES;
    let rangeStart = 0;
    while (rangeStart < count) {
      let rangeEnd = rangeStart + 1;
      while (rangeEnd < count && slots[rangeEnd] === slots[rangeEnd - 1] + 1) {
        rangeEnd++;
      }
      const rangeLen = rangeEnd - rangeStart;
      const firstSlot = slots[rangeStart];
      const byteOffset = firstSlot * strideBytes;
      const byteSize = rangeLen * strideBytes;
      const dataOffset = rangeStart * strideBytes;
      this._device.queue.writeBuffer(buf, byteOffset, totalData.buffer, dataOffset, byteSize);
      rangeStart = rangeEnd;
    }
  }

  writeSlots(slotIndices, storage) {
    const count = slotIndices.length;
    if (count === 0) return;
    if (count <= 32) {
      this._writeSlotsSimple(slotIndices, storage);
    } else {
      this._writeSlotsBatched(slotIndices, storage);
    }
  }

  uploadFromStorage(storage) {
    const device = this._device;
    const count = storage.activeCount;
    const totalFloats = count * STRIDE;
    const data = new Float32Array(totalFloats);
    storage.fillUploadBuffer(data, count, 0);
    device.queue.writeBuffer(this._buffer, 0, data.buffer, 0, totalFloats * FLOAT_BYTES);
  }

  async download(storage) {
    const device = this._device;
    const capacity = this._capacity;
    const floatCount = STRIDE * capacity;
    const byteSize = this._byteSize;

    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(this._buffer, 0, this._stagingBuffer, 0, byteSize);
    device.queue.submit([commandEncoder.finish()]);

    await this._stagingBuffer.mapAsync(GPUMapMode.READ);
    const mapped = new Float32Array(this._stagingBuffer.getMappedRange());
    const count = storage.activeCount;

    for (let i = 0; i < count; i++) {
      for (let f = 0; f < STRIDE; f++) {
        const name = ParticleBufferLayout.FIELD_NAMES[f];
        const val = mapped[i * STRIDE + f];
        storage.setFieldValue(i, name, ParticleBufferLayout.isU32Field(name) ? Math.round(val) : val);
      }
    }

    this._stagingBuffer.unmap();
  }

  resize(newCapacity) {
    if (newCapacity <= this._capacity) return;
    this._allocate(newCapacity);
  }

  get capacity() { return this._capacity; }
  get buffer() { return this._buffer; }
  get byteSize() { return this._byteSize; }

  destroy() {
    if (this._stagingBuffer) {
      try { this._stagingBuffer.unmap(); } catch {}
      this._stagingBuffer.destroy();
      this._stagingBuffer = null;
    }
    if (this._buffer) { this._buffer.destroy(); this._buffer = null; }
  }
}
