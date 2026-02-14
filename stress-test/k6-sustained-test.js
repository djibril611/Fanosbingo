import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const cardSelectionErrors = new Rate('card_selection_errors');
const cardSelectionDuration = new Trend('card_selection_duration');
const lobbyLoadDuration = new Trend('lobby_load_duration');
const successfulSelections = new Counter('successful_card_selections');
const failedSelections = new Counter('failed_card_selections');

const SUPABASE_URL = __ENV.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = __ENV.VITE_SUPABASE_ANON_KEY;
const TEST_USER_START_ID = 900000000;

export const options = {
  scenarios: {
    sustained_20_seconds: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: '20s',
      preAllocatedVUs: 30,
      maxVUs: 200,
    },
  },
  thresholds: {
    'card_selection_duration': ['p(95)<1500', 'p(99)<3000'],
    'lobby_load_duration': ['p(95)<800', 'p(99)<1500'],
    'card_selection_errors': ['rate<0.05'],
    'http_req_failed': ['rate<0.05'],
    'http_req_duration': ['p(95)<2000'],
  },
};

export function setup() {
  console.log('🚀 Starting sustained stress test: 400 users in 20 seconds');
  console.log(`📍 Supabase URL: ${SUPABASE_URL}`);
  console.log(`🆔 Test user ID range: ${TEST_USER_START_ID} - ${TEST_USER_START_ID + 399}`);

  return {
    gameId: null,
    testStartTime: Date.now(),
  };
}

export default function(data) {
  const vuNumber = __VU;
  const iterNumber = __ITER;
  const userId = TEST_USER_START_ID + ((vuNumber * 1000 + iterNumber) % 400);
  const cardNumber = (userId % 75) + 1;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'apikey': SUPABASE_ANON_KEY,
  };

  const startTime = Date.now();

  const lobbyData = {
    user_telegram_id: userId
  };

  const lobbyResponse = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/get_lobby_data_instant`,
    JSON.stringify(lobbyData),
    { headers }
  );

  const lobbyDuration = Date.now() - startTime;
  lobbyLoadDuration.add(lobbyDuration);

  check(lobbyResponse, {
    'lobby data loaded': (r) => r.status === 200,
  });

  let gameId = null;
  try {
    const lobbyResult = JSON.parse(lobbyResponse.body);
    if (lobbyResult && lobbyResult.game) {
      gameId = lobbyResult.game.id;
    }
  } catch (e) {
    console.error(`Failed to parse lobby response for user ${userId}`);
  }

  if (!gameId) {
    failedSelections.add(1);
    return;
  }

  sleep(0.2 + Math.random() * 0.3);

  const selectionStart = Date.now();

  const selectCardPayload = {
    p_game_id: gameId,
    p_telegram_user_id: userId,
    p_selected_number: cardNumber,
    p_telegram_username: `testuser${userId - TEST_USER_START_ID}`,
    p_telegram_first_name: `Test User ${userId - TEST_USER_START_ID}`
  };

  const selectionResponse = http.post(
    `${SUPABASE_URL}/functions/v1/select-card`,
    JSON.stringify(selectCardPayload),
    { headers }
  );

  const selectionDuration = Date.now() - selectionStart;
  cardSelectionDuration.add(selectionDuration);

  const selectionSuccess = check(selectionResponse, {
    'card selection status ok': (r) => r.status === 200,
    'card selection has response': (r) => r.body && r.body.length > 0,
  });

  if (selectionSuccess) {
    try {
      const result = JSON.parse(selectionResponse.body);
      if (result.success || (result.error && result.error.includes('already been taken'))) {
        successfulSelections.add(1);
        cardSelectionErrors.add(0);
      } else {
        failedSelections.add(1);
        cardSelectionErrors.add(1);
      }
    } catch (e) {
      failedSelections.add(1);
      cardSelectionErrors.add(1);
    }
  } else {
    failedSelections.add(1);
    cardSelectionErrors.add(1);
  }

  sleep(0.5);
}

export function teardown(data) {
  const testDuration = (Date.now() - data.testStartTime) / 1000;
  console.log(`\n✅ Sustained test completed in ${testDuration.toFixed(2)} seconds`);
  console.log('📊 Check the metrics above for detailed performance data');
}
