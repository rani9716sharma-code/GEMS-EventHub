#!/bin/zsh
set -e
cd "${0:A:h}"
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo "Node.js is missing. Install Node.js 22 or newer, then run this file again."
  read '?Press Enter to close.'
  exit 1
fi
node_major="$(node -p 'process.versions.node.split(".")[0]')"
node_minor="$(node -p 'process.versions.node.split(".")[1]')"
if [[ "$node_major" -lt 22 || ( "$node_major" -eq 22 && "$node_minor" -lt 18 ) ]]; then
  echo "EventHub needs Node.js 22.18 or newer (this Mac has $(node -v))."
  echo "Install the current LTS from https://nodejs.org, then run this file again."
  read '?Press Enter to close.'
  exit 1
fi
if [[ ! -f data/eventhub.sqlite ]]; then
  echo "No database found yet - a new empty one will be created and you will be asked to create the first administrator."
fi
listener="$(lsof -tiTCP:8787 -sTCP:LISTEN 2>/dev/null | head -1 || true)"
if [[ -n "$listener" ]]; then
  command_line="$(ps -p "$listener" -o command= 2>/dev/null || true)"
  if [[ "$command_line" == *"server/index.mjs"* ]]; then
    echo "Stopping the previous EventHub server (PID $listener)..."
    kill "$listener"
    for _ in {1..20}; do lsof -tiTCP:8787 -sTCP:LISTEN >/dev/null 2>&1 || break; sleep 0.25; done
  else
    echo "Port 8787 is used by another application: $command_line"
    echo "Close that application, then run START-MAC.command again."
    read '?Press Enter to close.'
    exit 1
  fi
fi
npm ci
npm run build
export EVENTHUB_DATA_DIR="$PWD/data"
npm start &
app_pid=$!
trap 'kill "$app_pid" 2>/dev/null || true' INT TERM EXIT
for _ in {1..40}; do
  if curl -fsS http://127.0.0.1:8787/api/health >/dev/null 2>&1; then
    echo "GEMS EventHub is running at http://127.0.0.1:8787"
    open http://127.0.0.1:8787
    wait "$app_pid"
    exit $?
  fi
  sleep 0.25
done
echo "EventHub did not start. Review the error shown above."
kill "$app_pid" 2>/dev/null || true
read '?Press Enter to close.'
exit 1
