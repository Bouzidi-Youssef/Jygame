import * as fs from "fs";
import wabtModule from "wabt";

const watPath = new URL("./death_sweep_simd.wat", import.meta.url);
const wasmPath = new URL("./death_sweep_simd.wasm", import.meta.url);

const wabt = await wabtModule();
wabt._wabt_set_simd_enabled(1);

const watSrc = fs.readFileSync(watPath, "utf8");
const module = wabt.parseWat("death_sweep_simd", watSrc, { simd: true });

const binary = module.toBinary({ log: false, write_debug_names: false });
fs.writeFileSync(wasmPath, Buffer.from(binary.buffer));

const sizeKb = (binary.buffer.byteLength / 1024).toFixed(1);
console.log(`Compiled ${watPath} → ${wasmPath} (${sizeKb} KB, SIMD enabled)`);
