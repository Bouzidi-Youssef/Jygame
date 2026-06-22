#!/bin/bash
# Start a minimal HTTP server for benchmark HTML files.
# ES module imports require HTTP, not file:// protocol.
#
# Usage: ./serve.sh [port]
#
# Open in your browser:
#   http://localhost:PORT/particles/tests/benchmarks/phase16x_readback_benchmark.html
#   http://localhost:PORT/particles/tests/benchmarks/phase16z_benchmark.html

PORT=${1:-8080}

# Resolve project root (2 levels up from this script)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "Serving from project root: $PROJECT_ROOT"
echo "  http://localhost:$PORT/particles/tests/benchmarks/phase16x_readback_benchmark.html"
echo "  http://localhost:$PORT/particles/tests/benchmarks/phase16z_benchmark.html"
echo "  http://localhost:$PORT/particles/tests/benchmarks/phase17b_alive_parity_benchmark.html"
echo "  http://localhost:$PORT/particles/tests/benchmarks/phase17b_dirty_upload_benchmark.html"
echo "  http://localhost:$PORT/particles/tests/benchmarks/phase17b_state_residency_benchmark.html"
echo "  http://localhost:$PORT/particles/tests/benchmarks/phase17c_death_queue_benchmark.html"
echo "  http://localhost:$PORT/particles/tests/benchmarks/phase17d_pipeline_benchmark.html"
echo "  http://localhost:$PORT/particles/tests/benchmarks/phase17e_upload_decompose_benchmark.html"
echo "  http://localhost:$PORT/particles/tests/benchmarks/phase17f_extract_decompose_benchmark.html"
echo "  http://localhost:$PORT/particles/tests/benchmarks/phase17g_floor_dissect_benchmark.html"
echo "  http://localhost:$PORT/particles/tests/benchmarks/phase17h_gpu_validate_benchmark.html"
echo "  http://localhost:$PORT/particles/tests/benchmarks/phase17h_c1_persistent_upload_benchmark.html"
echo "  http://localhost:$PORT/particles/tests/benchmarks/phase17h_c_death_sweep_benchmark.html"
echo "  http://localhost:$PORT/particles/tests/benchmarks/death_sweep_simd_benchmark.html"
echo ""
echo "Press Ctrl+C to stop."

cd "$PROJECT_ROOT"
exec python3 -m http.server "$PORT"
