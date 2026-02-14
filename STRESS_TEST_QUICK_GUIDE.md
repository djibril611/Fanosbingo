# Stress Test Quick Start Guide

Quick reference for running stress tests on your bingo application.

## 🚀 One-Command Test

The fastest way to run a complete stress test:

```bash
# 1. Generate test users
npm run stress:generate

# 2. Run spike test (400 users in 10 seconds)
npm run stress:spike

# 3. Analyze results
npm run stress:analyze

# 4. Cleanup
npm run stress:cleanup
```

## 📊 Available Commands

| Command | Description |
|---------|-------------|
| `npm run stress:generate` | Create 400 test users with balance |
| `npm run stress:spike` | Run spike test: 400 users in 10s |
| `npm run stress:sustained` | Run sustained test: 400 users in 20s |
| `npm run stress:gradual` | Run gradual test: 400 users in 30s |
| `npm run stress:all` | Run all three test scenarios |
| `npm run stress:monitor` | Monitor database in real-time |
| `npm run stress:analyze` | Analyze test results |
| `npm run stress:cleanup` | Remove all test data |
| `npm run stress:full-suite` | Complete automated test suite |

## 🎯 Test Scenarios

### Spike (10 seconds)
**Simulates:** Viral campaign, coordinated game start
- 40 users/second burst
- Tests maximum system capacity
- **Run:** `npm run stress:spike`

### Sustained (20 seconds)
**Simulates:** Peak traffic hours
- 20 users/second steady load
- Tests sustained performance
- **Run:** `npm run stress:sustained`

### Gradual (30 seconds)
**Simulates:** Normal high-traffic
- 13 users/second gradual ramp
- Tests baseline performance
- **Run:** `npm run stress:gradual`

## 📈 Interpreting Results

### During Test (K6 Output)
```
✓ lobby data loaded
✓ card selection status ok
✓ card selection has response

checks.........................: 100.00%
http_req_duration..............: avg=450ms p(95)=890ms
card_selection_duration........: avg=350ms p(95)=750ms
successful_card_selections.....: 398
failed_card_selections.........: 2
card_selection_errors..........: 0.50%
```

**Good Signs:**
- ✅ Checks > 95%
- ✅ P95 latency < 2000ms
- ✅ Error rate < 5%
- ✅ Most selections successful

**Warning Signs:**
- ⚠️ Checks < 90%
- ⚠️ P95 latency > 3000ms
- ⚠️ Error rate > 10%
- ⚠️ Many failed selections

### After Test (Analysis Output)
```
Success rate: 99.5%
Unique cards selected: 73
Average throughput: 39.8 players/second
Users with duplicate selections: 2
```

**Excellent:** Success > 99%, Throughput > 35/s
**Good:** Success > 95%, Throughput > 25/s
**Needs Work:** Success < 95%, Throughput < 20/s

## 🔧 Common Issues

### "No active game found"
**Fix:** Create a waiting game in the Admin panel first

### "K6 not found"
**Fix:** Install K6
```bash
# macOS
brew install k6

# Linux
sudo apt-get install k6

# Windows
choco install k6
```

### "Test users already exist"
**Fix:** Run cleanup first
```bash
npm run stress:cleanup
```

### High error rates
**Fix:**
1. Reduce load (edit test files)
2. Check database indexes
3. Review Supabase logs
4. Increase connection pool

## 💡 Pro Tips

1. **Monitor During Tests:** Run `npm run stress:monitor` in a separate terminal while testing

2. **Sequential Testing:** Wait 30 seconds between different test scenarios to let the database settle

3. **Custom User Count:**
   ```bash
   cd stress-test
   npx tsx generate-test-users.ts 500 150  # 500 users, 150 ETB each
   ```

4. **Save Results:** Tests output to console. Redirect to files:
   ```bash
   npm run stress:spike > results.txt 2>&1
   npm run stress:analyze > analysis.txt 2>&1
   ```

5. **Best Practice Flow:**
   ```bash
   npm run stress:cleanup      # Clean slate
   npm run stress:generate     # Create users
   npm run stress:spike        # Run test
   npm run stress:analyze      # Review results
   npm run stress:cleanup      # Clean up
   ```

## 📊 Performance Benchmarks

### Target Metrics by Scenario

| Scenario | Success Rate | P95 Latency | Error Rate | Throughput |
|----------|--------------|-------------|------------|------------|
| Spike    | > 90%        | < 2000ms    | < 10%      | > 30/s     |
| Sustained| > 95%        | < 1500ms    | < 5%       | > 20/s     |
| Gradual  | > 98%        | < 1000ms    | < 2%       | > 13/s     |

### Your System Can Handle 400 Concurrent Users If:
- ✅ Success rate stays above 95% in all scenarios
- ✅ P95 latency remains under 2000ms
- ✅ Error rate stays below 5%
- ✅ Database doesn't show connection pool exhaustion

## 🎓 Full Documentation

For detailed documentation, see: [stress-test/README.md](stress-test/README.md)

## ⚡ Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Connection errors | Check `.env` has correct Supabase credentials |
| Timeout errors | Increase Supabase connection pool limit |
| Duplicate key errors | Run `npm run stress:cleanup` first |
| No results in analysis | Make sure test completed successfully |
| K6 script errors | Verify `.env` variables are loaded |

## 🎯 Next Steps After Testing

1. **Review Analysis:** Identify bottlenecks from the analysis report
2. **Optimize:** Add database indexes, optimize queries
3. **Scale:** Adjust Supabase connection pool settings
4. **Monitor:** Set up alerts for production performance
5. **Iterate:** Re-run tests after optimizations

---

**Need help?** Check the full README in `stress-test/README.md`
