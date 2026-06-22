#!/usr/bin/env bash
set -e

echo "🚀 Setting up Steluma development environment..."

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm is required. Run: npm install -g pnpm"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required"; exit 1; }
command -v cargo >/dev/null 2>&1 || { echo "❌ Rust/Cargo is required"; exit 1; }

# Copy env if not exists
if [ ! -f .env ]; then
  cp .env.example .env
  echo "📋 Created .env from .env.example — fill in your values"
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Start infrastructure
echo "🐳 Starting Docker services..."
docker compose up -d postgres redis

# Wait for postgres
echo "⏳ Waiting for PostgreSQL..."
until docker compose exec postgres pg_isready -U steluma 2>/dev/null; do
  sleep 1
done

# Run migrations
echo "🗄️  Running database migrations..."
pnpm --filter api db:migrate

# Seed database
echo "🌱 Seeding database..."
pnpm --filter api db:seed

# Check Soroban CLI
if command -v soroban >/dev/null 2>&1; then
  echo "✅ Soroban CLI found"
else
  echo "⚠️  Soroban CLI not found. Install with:"
  echo "   cargo install --locked soroban-cli"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Start development:"
echo "  pnpm dev"
echo ""
echo "Deploy contracts to testnet:"
echo "  bash scripts/deploy-contracts.sh"
