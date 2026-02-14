#!/bin/bash

set -e

echo "🚀 Bingo Stress Test Runner"
echo "==================================="
echo ""

if [ ! -f ../.env ]; then
  echo "❌ Error: .env file not found in parent directory"
  exit 1
fi

source ../.env

if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_ANON_KEY" ]; then
  echo "❌ Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env"
  exit 1
fi

TEST_TYPE="${1:-spike}"

case $TEST_TYPE in
  spike)
    echo "🔥 Running SPIKE test: 400 users in 10 seconds (40 users/sec)"
    k6 run --env VITE_SUPABASE_URL="$VITE_SUPABASE_URL" --env VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" k6-spike-test.js
    ;;
  sustained)
    echo "📊 Running SUSTAINED test: 400 users in 20 seconds (20 users/sec)"
    k6 run --env VITE_SUPABASE_URL="$VITE_SUPABASE_URL" --env VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" k6-sustained-test.js
    ;;
  gradual)
    echo "📈 Running GRADUAL test: 400 users in 30 seconds (13 users/sec)"
    k6 run --env VITE_SUPABASE_URL="$VITE_SUPABASE_URL" --env VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" k6-gradual-test.js
    ;;
  all)
    echo "🎯 Running ALL test scenarios sequentially..."
    echo ""
    echo "1/3 - Spike Test"
    k6 run --env VITE_SUPABASE_URL="$VITE_SUPABASE_URL" --env VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" k6-spike-test.js
    sleep 5
    echo ""
    echo "2/3 - Sustained Test"
    k6 run --env VITE_SUPABASE_URL="$VITE_SUPABASE_URL" --env VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" k6-sustained-test.js
    sleep 5
    echo ""
    echo "3/3 - Gradual Test"
    k6 run --env VITE_SUPABASE_URL="$VITE_SUPABASE_URL" --env VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" k6-gradual-test.js
    ;;
  *)
    echo "❌ Invalid test type: $TEST_TYPE"
    echo "Usage: ./run-test.sh [spike|sustained|gradual|all]"
    exit 1
    ;;
esac

echo ""
echo "✅ Test completed!"
