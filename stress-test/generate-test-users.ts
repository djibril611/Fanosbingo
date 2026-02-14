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

interface TestUser {
  telegram_user_id: number;
  telegram_username: string;
  telegram_first_name: string;
  deposited_balance: number;
  won_balance: number;
}

async function generateTestUsers(count: number = 400, balancePerUser: number = 100): Promise<void> {
  console.log(`🚀 Generating ${count} test users with ${balancePerUser} ETB each...`);

  const startId = 900000000;
  const testUsers: TestUser[] = [];

  for (let i = 0; i < count; i++) {
    testUsers.push({
      telegram_user_id: startId + i,
      telegram_username: `testuser${i}`,
      telegram_first_name: `Test User ${i}`,
      deposited_balance: balancePerUser,
      won_balance: 0
    });
  }

  const batchSize = 50;
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < testUsers.length; i += batchSize) {
    const batch = testUsers.slice(i, i + batchSize);

    try {
      const { data, error } = await supabase
        .from('telegram_users')
        .upsert(batch, { onConflict: 'telegram_user_id' });

      if (error) {
        console.error(`❌ Error inserting batch ${i / batchSize + 1}:`, error.message);
        errorCount += batch.length;
      } else {
        successCount += batch.length;
        console.log(`✅ Inserted batch ${i / batchSize + 1} (${successCount}/${testUsers.length} users)`);
      }
    } catch (err) {
      console.error(`❌ Exception inserting batch ${i / batchSize + 1}:`, err);
      errorCount += batch.length;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   ✅ Successfully created: ${successCount} users`);
  console.log(`   ❌ Failed: ${errorCount} users`);
  console.log(`   💰 Total balance distributed: ${successCount * balancePerUser} ETB`);
  console.log(`   🎯 Test user ID range: ${startId} - ${startId + count - 1}`);
}

const userCount = parseInt(process.argv[2] || '400', 10);
const balance = parseInt(process.argv[3] || '100', 10);

generateTestUsers(userCount, balance)
  .then(() => {
    console.log('\n✨ Test users generation completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
