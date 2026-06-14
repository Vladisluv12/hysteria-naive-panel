#!/bin/bash
# tests/integration/run.sh - Run integration tests
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Activate venv
source "${SCRIPT_DIR}/venv/bin/activate"

# Ensure sing-box binary exists
if ! command -v "${SCRIPT_DIR}/bin/sing-box" &>/dev/null; then
    echo "sing-box binary not found. Run: bash setup.sh"
    exit 1
fi

# Start Docker services
echo "Starting Docker services..."
docker compose -f "${SCRIPT_DIR}/docker/docker-compose.yml" up -d --build

# Run tests
echo "Running tests..."
cd "${SCRIPT_DIR}"
python -m pytest tests/ -v --tb=short "$@"
EXIT_CODE=$?

# Cleanup
echo "Stopping Docker services..."
docker compose -f "${SCRIPT_DIR}/docker/docker-compose.yml" down -v

exit $EXIT_CODE
