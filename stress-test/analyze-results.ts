import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface AnalysisResults {
  totalTestPlayers: number;
  uniqueCardsSelected: number;
  duplicateAttempts: number;
  successfulSelections: number;
  avgSelectionTime: number;
  gamesCreated: number;
  testUsersInDatabase: number;
}

async function analyzeResults(): Promise<void> {
  console.log('🔍 Analyzing stress test results...\n');

  const { data: testPlayers } = await supabase
    .from('players')
    .select('id, selected_number, joined_at, telegram_user_id')
    .gte('telegram_user_id', 900000000)
    .lte('telegram_user_id', 900000999);

  const { data: testUsers } = await supabase
    .from('telegram_users')
    .select('telegram_user_id, deposited_balance, won_balance')
    .gte('telegram_user_id', 900000000)
    .lte('telegram_user_id', 900000999);

  const { data: recentGames } = await supabase
    .from('games')
    .select('id, status, created_at, started_at, finished_at')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });

  const totalTestPlayers = testPlayers?.length || 0;
  const testUsersInDatabase = testUsers?.length || 0;
  const gamesCreated = recentGames?.length || 0;

  const cardNumbers = new Set(testPlayers?.map(p => p.selected_number) || []);
  const uniqueCardsSelected = cardNumbers.size;

  const userSelections = new Map<number, number>();
  testPlayers?.forEach(p => {
    const count = userSelections.get(p.telegram_user_id) || 0;
    userSelections.set(p.telegram_user_id, count + 1);
  });

  const duplicateUsers = Array.from(userSelections.values()).filter(count => count > 1).length;

  let totalSelectionTime = 0;
  let validTimeMeasurements = 0;

  if (testPlayers && testPlayers.length > 1) {
    const sortedByTime = [...testPlayers].sort((a, b) =>
      new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
    );

    const firstJoin = new Date(sortedByTime[0].joined_at).getTime();
    const lastJoin = new Date(sortedByTime[sortedByTime.length - 1].joined_at).getTime();
    totalSelectionTime = (lastJoin - firstJoin) / 1000;
    validTimeMeasurements = totalPlayers;
  }

  console.log('='.repeat(80));
  console.log('📊 STRESS TEST ANALYSIS REPORT');
  console.log('='.repeat(80));

  console.log('\n🎯 Test Coverage:');
  console.log(`   Total test users in database: ${testUsersInDatabase}`);
  console.log(`   Users who selected cards: ${totalTestPlayers}`);
  console.log(`   Success rate: ${((totalTestPlayers / 400) * 100).toFixed(1)}%`);

  console.log('\n🎴 Card Selection Analysis:');
  console.log(`   Unique cards selected: ${uniqueCardsSelected}`);
  console.log(`   Cards available: 75`);
  console.log(`   Card utilization: ${((uniqueCardsSelected / 75) * 100).toFixed(1)}%`);
  console.log(`   Users with duplicate selections: ${duplicateUsers}`);

  console.log('\n⏱️  Performance Metrics:');
  if (validTimeMeasurements > 0) {
    console.log(`   Time span for all selections: ${totalSelectionTime.toFixed(2)}s`);
    console.log(`   Average throughput: ${(totalTestPlayers / totalSelectionTime).toFixed(2)} players/second`);
  } else {
    console.log(`   No timing data available`);
  }

  console.log('\n🎮 Game Statistics:');
  console.log(`   Games created in last 5 minutes: ${gamesCreated}`);
  if (recentGames && recentGames.length > 0) {
    const waitingGames = recentGames.filter(g => g.status === 'waiting').length;
    const playingGames = recentGames.filter(g => g.status === 'playing').length;
    const finishedGames = recentGames.filter(g => g.status === 'finished').length;
    console.log(`   - Waiting: ${waitingGames}`);
    console.log(`   - Playing: ${playingGames}`);
    console.log(`   - Finished: ${finishedGames}`);
  }

  console.log('\n💰 Balance Analysis:');
  if (testUsers && testUsers.length > 0) {
    const totalDeposited = testUsers.reduce((sum, u) => sum + u.deposited_balance, 0);
    const totalWon = testUsers.reduce((sum, u) => sum + u.won_balance, 0);
    const avgDepositedBalance = totalDeposited / testUsers.length;
    const avgWonBalance = totalWon / testUsers.length;
    console.log(`   Average deposited balance: ${avgDepositedBalance.toFixed(2)} ETB`);
    console.log(`   Average won balance: ${avgWonBalance.toFixed(2)} ETB`);
    console.log(`   Total in test ecosystem: ${(totalDeposited + totalWon).toFixed(2)} ETB`);
  }

  console.log('\n' + '='.repeat(80));

  console.log('\n✅ Recommendations:');
  if (totalTestPlayers < 380) {
    console.log('   ⚠️  Success rate below 95% - investigate connection issues');
  } else {
    console.log('   ✓ Success rate is healthy');
  }

  if (duplicateUsers > 10) {
    console.log('   ⚠️  High number of duplicate selections - check race condition handling');
  } else {
    console.log('   ✓ Duplicate handling is working well');
  }

  if (totalSelectionTime > 45) {
    console.log('   ⚠️  Selection time exceeded target - consider optimization');
  } else {
    console.log('   ✓ Performance within acceptable range');
  }

  console.log('\n');
}

analyzeResults()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
