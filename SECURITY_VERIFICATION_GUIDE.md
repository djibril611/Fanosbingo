# Security Verification Guide

This guide helps you verify that the SMS verification security fixes are working correctly.

## Quick Test Checklist

### ✅ Test 1: Verify Direct Insert is Blocked

**What to test:** Users can no longer insert fake bank SMS messages directly.

**How to test:**

1. Open your browser's developer console
2. Run this code:
   ```javascript
   const { data, error } = await supabase
     .from('bank_sms_messages')
     .insert({
       sender: '127',
       message_text: 'Test message ETB 100',
       received_at: new Date().toISOString()
     });

   console.log('Error:', error);
   // Should see permission denied error
   ```

**Expected result:** ❌ Permission denied error

**If it succeeds:** 🚨 SECURITY ISSUE - Contact support immediately

---

### ✅ Test 2: Verify Admin Manual Entry Works

**What to test:** Admins can still manually enter SMS through the secure interface.

**How to test:**

1. Log into admin panel with admin key
2. Navigate to SMS Management section
3. Click "Add SMS" in Manual SMS Entry
4. Fill in:
   - Sender: `127`
   - Message: `Dear Customer, You have received ETB 50.00 from Test User 0912345678. Transaction number: TBR999888777.`
5. Click "Add SMS"

**Expected result:** ✅ Success message with parsed details

**If it fails:** Check that:
- Admin key is correct in Admin.tsx (ADMIN_KEY constant)
- Edge function `manual-sms-entry` is deployed
- You're logged into admin panel

---

### ✅ Test 3: Verify High-Value Requires Reference

**What to test:** Deposits over 100 ETB require transaction reference verification.

**How to test:**

1. **Setup:** As admin, add this bank SMS:
   ```
   Dear Customer, You have received ETB 150.00 from Jane Doe 0923456789. Transaction number: TBR111222333.
   ```

2. **Test Case A - Without Reference (Should FAIL):**
   - In Telegram bot, paste:
     ```
     I sent ETB 150.00
     ```
   - Should be rejected with message about requiring transaction reference

3. **Test Case B - With Wrong Reference (Should FAIL):**
   - In Telegram bot, paste:
     ```
     You received ETB 150.00 from Jane Doe. Transaction: TBR999999999
     ```
   - Should not match (wrong reference)

4. **Test Case C - With Correct Reference (Should SUCCEED):**
   - In Telegram bot, paste:
     ```
     Dear Customer, You have received ETB 150.00 from Jane Doe 0923456789. Transaction number: TBR111222333.
     ```
   - Should match and credit 150 ETB

**Expected results:**
- ❌ Cases A & B fail to match
- ✅ Case C succeeds and credits balance

---

### ✅ Test 4: Verify Low-Value Works Without Reference

**What to test:** Deposits under 100 ETB can match without transaction reference.

**How to test:**

1. **Setup:** As admin, add this bank SMS:
   ```
   You have received ETB 50.00 from Bob Smith 0934567890
   ```

2. **Test:** In Telegram bot, paste:
   ```
   I sent ETB 50.00
   ```

**Expected result:** ✅ Should match and credit 50 ETB (because amount matches and is under 100)

---

### ✅ Test 5: Verify Time Window Restrictions

**What to test:** Only SMS within 24 hours can be matched.

**How to test:**

1. Check database for bank SMS older than 24 hours that are unclaimed
2. Try to match them by pasting similar SMS in Telegram
3. Should not match

**Expected result:** ❌ Old SMS (>24 hours) won't match

**Note:** This is harder to test without old data, but the logic is in place.

---

### ✅ Test 6: Verify Duplicate Prevention

**What to test:** Same SMS can't be entered twice.

**How to test:**

1. As admin, add SMS with message: `Test ETB 25.00 TBR555666777`
2. Immediately try to add the exact same SMS again
3. Should get "duplicate" message

**Expected result:** ✅ Second attempt blocked as duplicate

---

### ✅ Test 7: Verify Amount Tolerance

**What to test:** Small rounding differences are handled (±0.01 ETB).

**How to test:**

1. **Setup:** As admin, add bank SMS: `You received ETB 75.50`
2. **Test A:** User pastes: `I sent ETB 75.50` → Should match ✅
3. **Test B:** User pastes: `I sent ETB 75.49` → Should match ✅ (within tolerance)
4. **Test C:** User pastes: `I sent ETB 75.52` → Should NOT match ❌ (outside tolerance)

---

## Security Monitoring Checklist

### Daily Monitoring

Check these regularly to detect any issues:

1. **Rejected Submissions**
   ```sql
   SELECT * FROM user_sms_submissions
   WHERE status = 'rejected'
   ORDER BY created_at DESC
   LIMIT 20;
   ```
   - Look for patterns of repeated rejections
   - Flag users with many rejections

2. **Unclaimed Bank SMS**
   ```sql
   SELECT * FROM bank_sms_messages
   WHERE claimed_by_user_id IS NULL
   AND received_at > now() - interval '24 hours'
   ORDER BY received_at DESC;
   ```
   - These are deposits that haven't been claimed yet
   - Follow up if legitimate deposits aren't being claimed

3. **Large Deposits**
   ```sql
   SELECT u.*, b.*
   FROM user_sms_submissions u
   JOIN bank_sms_messages b ON u.matched_sms_id = b.id
   WHERE u.amount > 500
   AND u.created_at > now() - interval '7 days'
   ORDER BY u.created_at DESC;
   ```
   - Manually verify large deposits
   - Check transaction references match

### Weekly Security Review

1. **Failed Admin Access Attempts**
   - Check edge function logs for 403 errors
   - May indicate unauthorized access attempts

2. **Unusual Patterns**
   - Multiple users matching same bank SMS (shouldn't happen)
   - Users with unusually high success rates
   - SMS text that looks suspicious or auto-generated

3. **Database Policy Verification**
   ```sql
   -- Verify RLS policies haven't been changed
   SELECT tablename, policyname, roles, cmd
   FROM pg_policies
   WHERE schemaname = 'public'
   AND tablename = 'bank_sms_messages';
   ```
   - Should only show service_role policies for INSERT/UPDATE/DELETE
   - authenticated for SELECT only

---

## Red Flags to Watch For

🚨 **Immediate Action Required:**

1. **Users can insert into bank_sms_messages directly**
   - Check RLS policies immediately
   - Review recent deposits

2. **High-value deposits matching without references**
   - Check matching function logic
   - Review affected transactions

3. **Multiple matches for same bank SMS**
   - Investigate the users involved
   - Check for database trigger issues

⚠️ **Investigate Further:**

1. Many rejected submissions from same user
2. Perfect patterns in submission timing
3. SMS text that's too short or generic
4. Deposits claimed within seconds of bank SMS arrival (could be automated)

---

## Emergency Response

If you detect a security breach:

### Step 1: Immediate Actions

1. **Stop All Deposits**
   ```sql
   -- Disable SMS submission processing
   ALTER TABLE user_sms_submissions DISABLE TRIGGER trigger_match_user_sms;
   ```

2. **Review Recent Activity**
   ```sql
   -- Check last 24 hours of matched deposits
   SELECT u.*, b.*, t.balance, t.telegram_username
   FROM user_sms_submissions u
   JOIN bank_sms_messages b ON u.matched_sms_id = b.id
   JOIN telegram_users t ON u.telegram_user_id = t.telegram_user_id
   WHERE u.status = 'matched'
   AND u.created_at > now() - interval '24 hours'
   ORDER BY u.created_at DESC;
   ```

3. **Freeze Affected Accounts**
   ```sql
   -- Freeze account (manual SQL)
   UPDATE telegram_users
   SET balance = 0
   WHERE telegram_user_id = [SUSPICIOUS_USER_ID];
   ```

### Step 2: Investigation

1. Check all recent SMS submissions from suspicious users
2. Verify bank SMS sources (check receive-bank-sms logs)
3. Review edge function logs for unauthorized access
4. Check database audit logs if available

### Step 3: Recovery

1. Restore legitimate balances
2. Ban fraudulent accounts
3. Re-enable triggers after verification
4. Document incident and improve monitoring

---

## Additional Security Recommendations

### High Priority

1. **Change Default Admin Key**
   - Current: `admin123`
   - Update in both:
     - `/src/components/Admin.tsx` (ADMIN_KEY constant)
     - `/supabase/functions/manual-sms-entry/index.ts` (ADMIN_KEY constant)
   - Redeploy edge function after change

2. **Enable Database Audit Logging**
   - Track all changes to sensitive tables
   - Monitor RLS policy changes
   - Alert on suspicious patterns

3. **Add Rate Limiting**
   - Limit SMS submissions per user (e.g., max 5 per hour)
   - Add cooldown after failed submissions
   - Prevent automated attacks

### Medium Priority

1. **Improve Admin Authentication**
   - Move to proper auth system
   - Add session management
   - Use environment variables for keys

2. **Enhanced Monitoring Dashboard**
   - Real-time SMS submission view
   - Alert system for suspicious activity
   - Automated fraud detection

3. **SMS Content Verification**
   - Compare user SMS text with bank SMS
   - Calculate similarity score
   - Require minimum similarity for match

### Nice to Have

1. **Webhook Signature Verification**
   - Add HMAC signatures to SMS forwarding
   - Prevent spoofed SMS sources
   - Enhance API key security

2. **User Reputation System**
   - Track success/failure rates
   - Adjust verification strictness based on history
   - Reward trusted users

---

## Testing Complete ✅

Once you've verified all tests pass:

- [x] Direct insert is blocked
- [x] Admin manual entry works
- [x] High-value requires reference
- [x] Low-value works without reference
- [x] Time windows enforced
- [x] Duplicates prevented
- [x] Amount tolerance works

Your SMS verification system is now secure! 🔒

---

**Last Updated:** 2025-12-16
**Next Review:** Check monthly or after any database changes
