#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  ImageTron — setup & start"
echo ""

# ── Install dependencies ───────────────────────────────────────────────────────
echo "▸ Installing root dependencies..."
cd "$ROOT" && npm install --silent

echo "▸ Installing backend dependencies..."
cd "$ROOT/backend" && npm install --silent

echo "▸ Installing frontend dependencies..."
cd "$ROOT/frontend" && npm install --silent

echo ""
echo "✓ All dependencies installed"
echo ""

# ── Check .env ─────────────────────────────────────────────────────────────────
ENV_FILE="$ROOT/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
  cp "$ROOT/backend/.env.example" "$ENV_FILE"
  echo "⚠  Created backend/.env from .env.example — add your API keys before generating."
  echo ""
fi

WORLD_KEY=$(grep -E '^WORLD_LABS_API_KEY=' "$ENV_FILE" | cut -d= -f2)
FAL_KEY_VAL=$(grep -E '^FAL_KEY=' "$ENV_FILE" | cut -d= -f2)

if [ -z "$WORLD_KEY" ] || [ -z "$FAL_KEY_VAL" ]; then
  echo "⚠  backend/.env is missing API keys:"
  [ -z "$WORLD_KEY" ]   && echo "   • WORLD_LABS_API_KEY is empty"
  [ -z "$FAL_KEY_VAL" ] && echo "   • FAL_KEY is empty"
  echo "   The app will start but generation will fail until keys are set."
  echo ""
fi

# ── Start servers ──────────────────────────────────────────────────────────────
echo "▸ Starting backend  → http://localhost:3001"
echo "▸ Starting frontend → http://localhost:5173"
echo ""
echo "  Press Ctrl+C to stop both servers."
echo ""

# Use concurrently from root node_modules
cd "$ROOT"
npx concurrently \
  --names "backend,frontend" \
  --prefix-colors "magenta,cyan" \
  "cd backend && npx tsx watch src/index.ts" \
  "cd frontend && npx vite"
