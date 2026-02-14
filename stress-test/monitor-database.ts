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

interface DatabaseStats {
  timestamp: string;
  totalPlayers: number;
  waitingGames: number;
  playingGames: number;
  finishedGames: number;
  testUsers: number;
}

async function monitorDatabase(intervalSeconds: number = 2, durationSeconds: number = 60): Promise<void> {
  console.log('📊 Starting database monitoring...');
  console.log(`⏱️  Interval: ${intervalSeconds}s | Duration: ${durationSeconds}s\n`);

  const stats: DatabaseStats[] = [];
  const startTime = Date.now();
  const endTime = startTime + (durationSeconds * 1000);

  let iteration = 0;

  const interval = setInterval(async () => {
    const now = Date.now();

    if (now >= endTime) {
      clearInterval(interval);
      await printSummary(stats);
      process.exit(0);
      return;
    }

    iteration++;

    try {
      const [playersResult, gamesResult, testUsersResult] = await Promise.all([
        supabase.from('players').select('id', { count: 'exact', head: true }),
        supabase.from('games').select('status'),
        supabase.from('telegram_users').select('telegram_user_id', { count: 'exact', head: true })
          .gte('telegram_user_id', 900000000)
          .lte('telegram_user_id', 900000999)
      ]);

      const totalPlayers = playersResult.count || 0;
      const testUsers = testUsersResult.count || 0;

      const games = gamesResult.data || [];
      const waitingGames = games.filter(g => g.status === 'waiting').length;
      const playingGames = games.filter(g => g.status === 'playing').length;
      const finishedGames = games.filter(g => g.status === 'finished').length;

      const stat: DatabaseStats = {
        timestamp: new Date().toISOString(),
        totalPlayers,
        waitingGames,
        playingGames,
        finishedGames,
        testUsers
      };

      stats.push(stat);

      const elapsed = ((now - startTime) / 1000).toFixed(1);
      console.log(`[${elapsed}s] Players: ${totalPlayers} | Waiting: ${waitingGames} | Playing: ${playingGames} | Finished: ${finishedGames} | Test Users: ${testUsers}`);

    } catch (error) {
      console.error(`❌ Error fetching stats:`, error);
    }
  }, intervalSeconds * 1000);
}

async function printSummary(stats: DatabaseStats[]): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('📈 MONITORING SUMMARY');
  console.log('='.repeat(80));

  if (stats.length === 0) {
    console.log('No data collected');
    return;
  }

  const maxPlayers = Math.max(...stats.map(s => s.totalPlayers));
  const avgPlayers = stats.reduce((sum, s) => sum + s.totalPlayers, 0) / stats.length;
  const maxGames = Math.max(...stats.map(s => s.waitingGames + s.playingGames + s.finishedGames));

  console.log(`\n🎯 Peak Players: ${maxPlayers}`);
  console.log(`📊 Average Players: ${avgPlayers.toFixed(0)}`);
  console.log(`🎮 Peak Total Games: ${maxGames}`);
  console.log(`📝 Total Samples: ${stats.length}`);

  console.log('\n📉 Player Growth Timeline:');
  const step = Math.max(1, Math.floor(stats.length / 10));
  for (let i = 0; i < stats.length; i += step) {
    const s = stats[i];
    const bar = '█'.repeat(Math.floor(s.totalPlayers / 10));
    const time = new Date(s.timestamp).toLocaleTimeString();
    console.log(`  ${time}: ${bar} ${s.totalPlayers} players`);
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

const interval = parseInt(process.argv[2] || '2', 10);
const duration = parseInt(process.argv[3] || '60', 10);

monitorDatabase(interval, duration);
