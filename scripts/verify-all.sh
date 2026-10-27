#!/usr/bin/env bash
# Verify the core and both SDKs using an already prepared development environment.
# Tests own their mock sidecars; do not start a shared market server here.
set -euo pipefail
cd "$(dirname "$0")/.."

for directory in core sdks/python/tests sdks/typescript/tests; do
    if [ ! -d "$directory" ]; then
        echo "Required verification directory is missing: $directory" >&2
        exit 1
    fi
done
command -v npm >/dev/null
command -v python3 >/dev/null

echo "Building Core..."
(cd core && npm run build)

echo "Running Core Tests..."
npm test --workspace=pmxt-core -- --runInBand --passWithNoTests=false

echo "Running Python SDK Tests..."
# Override pytest.ini's default integration exclusion. These tests use a local
# mock exchange, and start/stop their own disposable sidecar process.
(cd sdks/python && python3 -m pytest tests/ -v -m "")

echo "Running TypeScript SDK Tests..."
(cd sdks/typescript && npm test -- --runInBand --passWithNoTests=false)

echo "All SDK verification stages passed. See individual results for skips and scope."
