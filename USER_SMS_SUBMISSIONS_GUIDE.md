# User SMS Submissions Viewer Guide

## Overview

The User SMS Submissions viewer shows all SMS messages that users send via Telegram to claim their deposits. This allows you to monitor deposit attempts, see which ones matched successfully, and identify any issues.

## Location

**Admin Panel → SMS Management Section**

The viewer appears between the Manual SMS Entry form and the SMS Messages (Bank SMS) section.

## What You Can See

### 1. Status Overview

At the top, you'll see:
- Total number of submissions
- Count of pending submissions (awaiting matching)
- Real-time status updates

### 2. Filter Options

Four filter buttons to view different submission types:

- **All** - Shows all user submissions regardless of status
- **Pending** - Submissions waiting for matching bank SMS
- **Matched** - Successfully matched and credited submissions
- **Rejected** - Submissions that failed verification

### 2.5. Manual Accept/Reject Controls (NEW!)

For pending submissions, you can now manually verify them as a backup:

**Manual Accept/Reject Button**
- Click this button on any pending submission
- Opens a verification panel with two options:

**Accept Option:**
1. Select a bank SMS from dropdown (shows unclaimed SMS only)
2. Each option shows: Amount - Sender - Transaction Ref - Date/Time
3. Click "Accept & Credit" to manually match and credit the user
4. User's balance is immediately updated

**Reject Option:**
1. Click "Reject" button in the verification panel
2. Enter a detailed rejection reason (required)
3. Click "Confirm Rejection"
4. User is notified via Telegram about the rejection

This manual control is useful when:
- Auto-matching fails due to timing issues
- Bank SMS has slightly different format
- Transaction reference doesn't match exactly
- You need to investigate before accepting/rejecting

### 3. Submission Details

Each submission card shows:

#### User Information
- Telegram username (e.g., @johndoe)
- Full name (from Telegram profile)
- User ID
- Submission timestamp

#### Claimed Amount & Reference
- Amount user claims they deposited (in ETB)
- Transaction reference number (if provided)
- These are extracted from the SMS text they pasted

#### SMS Text
- The full text the user pasted in Telegram
- Displayed in monospace font for readability

#### Status Indicators

**Matched (Green)** ✅
- Successfully matched with bank SMS
- User's balance has been credited
- Shows which bank SMS ID it matched with
- Shows processing timestamp

**Pending (Yellow)** ⏳
- Waiting for matching bank SMS
- Will auto-expire after 10 minutes if no match
- System is looking for bank SMS with same amount

**Rejected (Red)** ❌
- Failed verification
- Shows detailed rejection reason
- Common reasons:
  - No matching deposit found
  - High-value deposit without transaction reference
  - Amount mismatch
  - Transaction reference mismatch

## Common Scenarios

### Scenario 1: Successful Deposit

1. User sends money to your Telebirr account
2. Bank SMS arrives on your phone → forwarded to system
3. User pastes their SMS in Telegram bot
4. System matches amounts and references
5. Status shows "Matched" (green)
6. User's balance is automatically credited

### Scenario 2: User Submitted Before Bank SMS Arrived

1. User pastes SMS immediately after sending
2. Status shows "Pending" (yellow)
3. Bank SMS arrives within 5 minutes
4. System automatically matches and credits
5. Status updates to "Matched" (green)

### Scenario 3: Fake Deposit Attempt

1. User pastes fake SMS or wrong amount
2. System searches for matching bank SMS
3. No match found after 10 minutes
4. Status shows "Rejected" (red)
5. Shows reason: "No matching deposit found"

### Scenario 4: High-Value Without Reference

1. User claims 150 ETB deposit
2. User doesn't include transaction reference
3. System rejects immediately (security requirement)
4. Status shows "Rejected" (red)
5. Reason: "High-value deposits require transaction reference verification"

### Scenario 5: Manual Verification Needed

1. User submits deposit SMS
2. Auto-matching fails (slightly different format)
3. Admin sees submission stuck in "Pending"
4. Admin clicks "Manual Accept/Reject" button
5. Admin selects correct bank SMS from dropdown
6. Admin clicks "Accept & Credit"
7. Status changes to "Matched" (green)
8. User's balance is credited immediately

## How to Use This Data

### 1. Monitor for Issues

**Check Pending Submissions:**
- If many submissions stuck in "Pending", check if bank SMS forwarding is working
- Pending items should resolve within 5-10 minutes

**Review Rejections:**
- Look for patterns in rejected submissions
- Legitimate users may need help formatting their SMS correctly
- Multiple rejections from same user could indicate attempted fraud

### 2. Customer Support

When users report deposit issues:

1. Search for their username in the submissions list
2. Check their submission status
3. If "Matched" - deposit was successful
4. If "Pending" - ask them to wait a few minutes
5. If "Rejected" - check rejection reason and guide them

### 3. Fraud Detection

Look for suspicious patterns:

- Same user with many rejected submissions
- Users claiming amounts that don't match any bank SMS
- Unusually short or generic SMS text
- Perfect patterns suggesting automation

### 4. Reconciliation

Cross-reference with bank SMS:

1. Click on matched submission to see bank SMS ID
2. Find that bank SMS in the "SMS Messages" section below
3. Verify amounts match
4. Check transaction references align

## Refresh & Updates

**Auto-Refresh:**
- The list doesn't auto-refresh by default
- Click the "Refresh" button to get latest data

**When to Refresh:**
- After manually entering bank SMS
- When user reports they just submitted
- Periodically to check pending submissions

## Troubleshooting

### Problem: No submissions showing

**Possible causes:**
1. No users have submitted deposits yet
2. Telegram bot not configured
3. Database connection issue

**Solution:** Check Telegram bot settings in Settings tab

### Problem: All submissions stuck in "Pending"

**Possible causes:**
1. Bank SMS forwarding not working
2. SMS extraction not parsing correctly
3. Time windows too strict

**Solution:**
1. Check bank SMS messages section
2. Verify SMS forwarding is active
3. Check extraction patterns in migration files
4. **Use manual verification as temporary solution:**
   - Click "Manual Accept/Reject" on each pending item
   - Manually match with correct bank SMS
   - This keeps service running while you fix auto-matching

### Problem: High rejection rate

**Possible causes:**
1. Users not including full SMS text
2. Users submitting before bank SMS arrives
3. Transaction reference mismatch

**Solution:**
1. Update bot instructions to tell users to paste full SMS
2. Tell users to wait 1-2 minutes after sending money
3. For high-value deposits, emphasize including transaction number

## Security Notes

### What Users CANNOT Do

- Users can only submit SMS via Telegram bot
- They cannot directly insert into database (blocked by RLS)
- They cannot modify their submission after sending
- They cannot see other users' submissions

### What Admins CAN Do

- View all user submissions
- See matched/rejected status
- Cross-reference with bank SMS
- Track suspicious activity

### Security Features

- High-value deposits (>100 ETB) require transaction reference match
- Submissions expire after 10 minutes if no match
- Only one bank SMS can be claimed per user submission
- All activity is logged with timestamps

## Best Practices

### Daily Routine

1. **Morning Check:**
   - Review overnight submissions
   - Check for stuck pending items
   - Verify all high-value deposits

2. **During Active Hours:**
   - Monitor pending submissions
   - Respond to user support requests
   - Check for unusual patterns

3. **Evening Review:**
   - Reconcile day's deposits
   - Review rejection reasons
   - Check for any issues

### Weekly Review

1. Analyze rejection patterns
2. Identify users with repeated issues
3. Update bot instructions if needed
4. Review security alerts

### Monthly Audit

1. Cross-check all matched submissions with bank records
2. Verify total deposited amounts
3. Review fraud detection logs
4. Update verification rules if needed

## Tips for Better Results

### 1. User Education

Teach users to:
- Wait 1-2 minutes after sending money
- Paste the COMPLETE SMS message
- Include transaction reference for large amounts
- Contact support if rejected

### 2. Clear Instructions

In your Telegram bot, tell users:
```
After sending money, wait 1-2 minutes, then paste your COMPLETE SMS message including:
- Amount
- Transaction number
- Sender name/phone

Example:
Dear Customer, You have received ETB 50.00 from John Doe 0912345678. Transaction number: TBR123456789.
```

### 3. Support Workflow

When user says "I deposited but didn't get credit":

1. Ask for their Telegram username
2. Check User SMS Submissions for their username
3. Check status:
   - **Matched:** Tell them to check balance, credit was successful
   - **Pending:**
     - Check if bank SMS exists in "SMS Messages" section
     - If yes, use "Manual Accept/Reject" to approve immediately
     - If no, ask them to wait for bank SMS to arrive
   - **Rejected:** Explain rejection reason and help them resubmit correctly
   - **Not found:** Ask them to submit SMS via bot

**Fast Resolution with Manual Verification:**
1. User reports issue
2. Find their pending submission
3. Click "Manual Accept/Reject"
4. Select matching bank SMS
5. Click "Accept & Credit"
6. Confirm with user instantly (no waiting!)

## Integration with Other Sections

### Works Together With:

1. **Manual SMS Entry:** Admin can manually add missing bank SMS
2. **SMS Messages (Bank SMS):** Shows the other side of the matching
3. **User Management:** See total deposits per user
4. **Bank Management:** Ensures correct deposit account info

### Workflow Example:

1. User contacts support: "My deposit isn't showing"
2. Check **User SMS Submissions** → Status: Pending
3. Check **SMS Messages** → Bank SMS not found
4. Use **Manual SMS Entry** → Add the missing bank SMS
5. System auto-matches → Status changes to Matched
6. Check **User Management** → Balance updated
7. Confirm with user: "Your deposit has been credited"

---

**Last Updated:** 2025-12-16
**Component:** UserSmsSubmissions.tsx
**Location:** Admin Panel → SMS Management
