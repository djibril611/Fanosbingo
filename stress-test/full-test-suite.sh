#!/bin/bash

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         BINGO STRESS TEST - COMPLETE TEST SUITE               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

if [ ! -f ../.env ]; then
  echo "❌ Error: .env file not found"
  exit 1
fi

echo "📋 Phase 1: Cleanup old test data"
echo "─────────────────────────────────────"
npx tsx cleanup-test-data.ts
echo ""

echo "👥 Phase 2: Generate 400 test users"
echo "─────────────────────────────────────"
npx tsx generate-test-users.ts 400 100
echo ""

echo "⏳ Waiting 5 seconds for data to settle..."
sleep 5
echo ""

echo "🔥 Phase 3: Running spike test (400 users in 10s)"
echo "─────────────────────────────────────"
./run-test.sh spike 2>&1 | tee results-spike.log
echo ""

echo "⏳ Waiting 10 seconds between tests..."
sleep 10
echo ""

echo "📊 Phase 4: Analyzing spike test results"
echo "─────────────────────────────────────"
npx tsx analyze-results.ts | tee analysis-spike.log
echo ""

echo "🧹 Phase 5: Cleanup for next test"
echo "─────────────────────────────────────"
npx tsx cleanup-test-data.ts
echo ""

echo "👥 Phase 6: Regenerate test users"
echo "─────────────────────────────────────"
npx tsx generate-test-users.ts 400 100
echo ""

echo "⏳ Waiting 5 seconds..."
sleep 5
echo ""

echo "📈 Phase 7: Running sustained test (400 users in 20s)"
echo "─────────────────────────────────────"
./run-test.sh sustained 2>&1 | tee results-sustained.log
echo ""

echo "⏳ Waiting 10 seconds..."
sleep 10
echo ""

echo "📊 Phase 8: Analyzing sustained test results"
echo "─────────────────────────────────────"
npx tsx analyze-results.ts | tee analysis-sustained.log
echo ""

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    TEST SUITE COMPLETED                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "📄 Results saved to:"
echo "   - results-spike.log"
echo "   - analysis-spike.log"
echo "   - results-sustained.log"
echo "   - analysis-sustained.log"
echo ""
echo "🧹 Don't forget to run cleanup: npx tsx cleanup-test-data.ts"
