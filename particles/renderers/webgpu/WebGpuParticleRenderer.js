import { WebGpuDeviceManager } from "../../gpu/webgpu/WebGpuDeviceManager.js";

const VERTEX_SHADER_WGSL = `
struct Particle {
  x: f32, y: f32, vx: f32, vy: f32,
  ax: f32, ay: f32, life: f32, maxLife: f32,
  ageRatio: f32, rotation: f32, rotationSpeed: f32,
  size: f32, alpha: f32, depth: f32,
  r: u32, g: u32, b: u32,
  alive: u32,
  seed: f32,
  segment: u32,
};

@group(0) @binding(0) var<storage, read> particles : array<Particle>;
@group(0) @binding(1) var<uniform> uniforms : RenderUniforms;

struct RenderUniforms {
  resolution: vec2<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec3<f32>,
  @location(2) alpha: f32,
};

const QUAD_POS = array<vec2<f32>, 4>(
  vec2(-0.5, -0.5), vec2(0.5, -0.5), vec2(0.5, 0.5), vec2(-0.5, 0.5),
);

const QUAD_UV = array<vec2<f32>, 4>(
  vec2(0.0, 1.0), vec2(1.0, 1.0), vec2(1.0, 0.0), vec2(0.0, 0.0),
);

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
  let p = particles[instanceIndex];

  var pos = vec4<f32>();
  if (p.alive > 0u) {
    let w = p.size;
    let h = p.size;
    var local = QUAD_POS[vertexIndex] * vec2(w, h);
    local -= vec2(w * 0.5, h * 0.5);
    let c = cos(p.rotation);
    let s = sin(p.rotation);
    local = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
    let world = local + vec2(p.x, p.y);
    var ndc = world / uniforms.resolution * 2.0 - 1.0;
    ndc.y = -ndc.y;
    pos = vec4(ndc, p.depth * 0.00001, 1.0);
  } else {
    pos = vec4(0.0, 0.0, 0.0, 0.0);
  }

  var output: VertexOutput;
  output.position = pos;
  output.uv = QUAD_UV[vertexIndex];
  output.color = vec3(f32(p.r) / 255.0, f32(p.g) / 255.0, f32(p.b) / 255.0);
  output.alpha = p.alpha;
  return output;
}
`;

const FRAGMENT_SHADER_WGSL = `
@group(1) @binding(0) var textureSampler: sampler;
@group(1) @binding(1) var particleTexture: texture_2d<f32>;

struct FragmentInput {
  @location(0) uv: vec2<f32>,
  @location(1) color: vec3<f32>,
  @location(2) alpha: f32,
};

@fragment
fn fs_main(input: FragmentInput) -> @location(0) vec4<f32> {
  let texColor = textureSample(particleTexture, textureSampler, input.uv);
  let resultColor = input.color * texColor.rgb;
  let resultAlpha = input.alpha * texColor.a;
  return vec4(resultColor, resultAlpha);
}
`;

const INDEX_DATA = new Uint16Array([0, 1, 2, 0, 2, 3]);

export class WebGpuParticleRenderer {
  constructor({ canvas, device } = {}) {
    this._canvas = canvas || null;
    this._device = device || WebGpuDeviceManager.device();
    this._context = null;
    this._pipeline = null;
    this._pipelineLayout = null;
    this._bindGroupLayout0 = null;
    this._bindGroupLayout1 = null;
    this._indexBuffer = null;
    this._renderUniformBuffer = null;
    this._renderBindGroup0 = null;
    this._particleBuffer = null;
    this._whiteTexture = null;
    this._whiteTextureView = null;
    this._sampler = null;
    this._config = {
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: "premultiplied",
    };
    this._initialized = false;
  }

  async initialize() {
    if (this._initialized) return;
    const device = this._device;

    if (this._canvas) {
      this._context = this._canvas.getContext("webgpu");
      this._context.configure({
        device,
        format: this._config.format,
        alphaMode: this._config.alphaMode,
      });
    }

    // Create bind group layouts
    this._bindGroupLayout0 = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
      ],
    });

    this._bindGroupLayout1 = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float" },
        },
      ],
    });

    this._pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this._bindGroupLayout0, this._bindGroupLayout1],
    });

    // Shader modules
    const vsModule = device.createShaderModule({ code: VERTEX_SHADER_WGSL });
    const fsModule = device.createShaderModule({ code: FRAGMENT_SHADER_WGSL });

    // Render pipeline
    this._pipeline = device.createRenderPipeline({
      layout: this._pipelineLayout,
      vertex: {
        module: vsModule,
        entryPoint: "vs_main",
      },
      fragment: {
        module: fsModule,
        entryPoint: "fs_main",
        targets: [
          {
            format: this._config.format,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
      },
    });

    // Index buffer (static)
    this._indexBuffer = device.createBuffer({
      size: INDEX_DATA.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this._indexBuffer, 0, INDEX_DATA.buffer);

    // Render uniform buffer (resolution)
    this._renderUniformBuffer = device.createBuffer({
      size: 16, // vec2<f32> (8 bytes) + padding to 16 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // White fallback texture
    this._whiteTexture = device.createTexture({
      size: { width: 1, height: 1, depthOrArrayLayers: 1 },
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this._whiteTextureView = this._whiteTexture.createView();
    device.queue.writeTexture(
      { texture: this._whiteTexture },
      new Uint8Array([255, 255, 255, 255]),
      { bytesPerRow: 4, rowsPerImage: 1 },
      { width: 1, height: 1, depthOrArrayLayers: 1 },
    );

    // Sampler
    this._sampler = device.createSampler({
      minFilter: "linear",
      magFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });

    this._initialized = true;
  }

  setCanvas(canvas) {
    this._canvas = canvas;
    if (this._initialized) {
      this._context = canvas.getContext("webgpu");
      this._context.configure({
        device: this._device,
        format: this._config.format,
        alphaMode: this._config.alphaMode,
      });
    }
  }

  setParticleBuffer(buffer) {
    this._particleBuffer = buffer;
    this._renderBindGroup0 = null; // invalidate, will recreate on next render
  }

  _ensureBindGroup0() {
    if (this._renderBindGroup0) return;

    this._renderBindGroup0 = this._device.createBindGroup({
      layout: this._bindGroupLayout0,
      entries: [
        {
          binding: 0,
          resource: { buffer: this._particleBuffer },
        },
        {
          binding: 1,
          resource: { buffer: this._renderUniformBuffer },
        },
      ],
    });
  }

  render(particleCount, textureView) {
    if (!this._initialized) return;
    if (!this._context || !this._canvas) return;
    if (particleCount === 0) return;

    this._ensureBindGroup0();

    const device = this._device;
    const canvas = this._canvas;

    // Write resolution uniform
    const resolution = new Float32Array([canvas.width, canvas.height]);
    device.queue.writeBuffer(this._renderUniformBuffer, 0, resolution.buffer);

    // Create bind group 1 (texture)
    const texView = textureView || this._whiteTextureView;
    const bindGroup1 = device.createBindGroup({
      layout: this._bindGroupLayout1,
      entries: [
        { binding: 0, resource: this._sampler },
        { binding: 1, resource: texView },
      ],
    });

    // Get current texture from swap chain
    const texture = this._context.getCurrentTexture();
    const view = texture.createView();

    const commandEncoder = device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          loadOp: "load",
          storeOp: "store",
        },
      ],
    });

    renderPass.setPipeline(this._pipeline);
    renderPass.setBindGroup(0, this._renderBindGroup0);
    renderPass.setBindGroup(1, bindGroup1);
    renderPass.setIndexBuffer(this._indexBuffer, "uint16");
    renderPass.drawIndexed(6, particleCount, 0, 0, 0);
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
  }

  destroy() {
    this._initialized = false;
    const device = this._device;
    if (!device) return;
    if (this._indexBuffer) { this._indexBuffer.destroy(); this._indexBuffer = null; }
    if (this._renderUniformBuffer) { this._renderUniformBuffer.destroy(); this._renderUniformBuffer = null; }
    if (this._whiteTexture) { this._whiteTexture.destroy(); this._whiteTexture = null; }
    this._whiteTextureView = null;
    this._pipeline = null;
    this._pipelineLayout = null;
    this._bindGroupLayout0 = null;
    this._bindGroupLayout1 = null;
    this._renderBindGroup0 = null;
    this._particleBuffer = null;
    this._context = null;
    this._canvas = null;
  }
}
