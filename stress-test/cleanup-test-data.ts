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

async function cleanupTestData(): Promise<void> {
  console.log('🧹 Starting cleanup of test data...\n');

  const startId = 900000000;
  const endId = 900000999;

  console.log('1️⃣ Deleting test user players from games...');
  const { error: playersError } = await supabase
    .from('players')
    .delete()
    .gte('telegram_user_id', startId)
    .lte('telegram_user_id', endId);

  if (playersError) {
    console.error('❌ Error deleting players:', playersError.message);
  } else {
    console.log('✅ Test players deleted');
  }

  console.log('\n2️⃣ Deleting test users...');
  const { error: usersError } = await supabase
    .from('telegram_users')
    .delete()
    .gte('telegram_user_id', startId)
    .lte('telegram_user_id', endId);

  if (usersError) {
    console.error('❌ Error deleting users:', usersError.message);
  } else {
    console.log('✅ Test users deleted');
  }

  console.log('\n3️⃣ Cleaning up old test games (optional)...');
  const { error: gamesError } = await supabase
    .from('games')
    .delete()
    .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .eq('status', 'finished');

  if (gamesError) {
    console.error('❌ Error deleting old games:', gamesError.message);
  } else {
    console.log('✅ Old finished games cleaned up');
  }

  console.log('\n✨ Cleanup completed!');
}

cleanupTestData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
