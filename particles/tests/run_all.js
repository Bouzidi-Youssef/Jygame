// Run all non-browser parity tests
async function runAll() {
  const { runner: compute } = await import("./compute/ComputeParity.test.js");
  const { runner: modifier } = await import("./compute/ModifierParity.test.js");
  const { runner: emit } = await import("./compute/EmitParity.test.js");
  const { runner: lifecycle } = await import("./compute/LifecycleParity.test.js");
  const { runner: wgsl } = await import("./wgsl/WgslVerification.test.js");

  const runners = [
    { name: "ComputeParity", runner: compute },
    { name: "ModifierParity", runner: modifier },
    { name: "EmitParity", runner: emit },
    { name: "LifecycleParity", runner: lifecycle },
    { name: "WgslVerification", runner: wgsl },
  ];

  let allPassed = true;
  for (const { name, runner: r } of runners) {
    await r.run();
    const passed = r.summary();
    console.log(`  ${name}: ${passed ? "PASS" : "FAIL"}`);
    if (!passed) allPassed = false;
  }

  process.exit(allPassed ? 0 : 1);
}

runAll();
