# SMS Forwarding App Configuration Fix

## Problem
Your SMS forwarding app is sending placeholder variables like `{sender}` and `{message}` instead of the actual SMS content.

**Result:**
- App shows "Success" ✓
- But messages appear empty in admin panel
- No amounts are extracted
- Manual verification fails with "0 ETB"

## Solution: Fix Your SMS Forwarding App Configuration

### Step 1: Open SMS Forwarding App Settings
1. Open your SMS forwarding app on your phone
2. Find the rule you created for forwarding to your server
3. Look for the "Body" or "Message" configuration

### Step 2: Check URL Configuration
Your webhook URL should be:
```
https://uxijzrkbxduowtojdgpw.supabase.co/functions/v1/receive-bank-sms
```

### Step 3: Fix Request Format

The app needs to send data in one of these formats:

#### Option A: URL Parameters (GET Request)
```
?sender={sender}&message={body}&api_key=YOUR_API_KEY
```

#### Option B: Form Data (POST Request)
```
Content-Type: application/x-www-form-urlencoded

sender={sender}&message={body}&api_key=YOUR_API_KEY
```

#### Option C: JSON (POST Request)
```
Content-Type: application/json

{
  "sender": "{sender}",
  "message": "{body}",
  "api_key": "YOUR_API_KEY"
}
```

### Step 4: Important Variable Names

**CRITICAL:** Use these exact variable names:

| What | Correct Variable | Wrong Examples |
|------|-----------------|----------------|
| SMS Sender | `{sender}` or `{from}` | `{number}`, `{phone}` |
| SMS Content | `{body}` or `{message}` | `{text}`, `{content}` |
| API Key | `YOUR_ACTUAL_KEY` | `{api_key}` (don't use placeholder) |

### Step 5: Your API Key
```
e06f599b98029349076b1e8a6a7f3af556173669266abfe55094982cf9b50be5
```

**Replace** `YOUR_API_KEY` with the key above (copy exactly, no spaces).

## Common SMS Forwarding Apps

### SMS Forwarder (by Triangulum Studio)
1. Open the app
2. Tap on your rule
3. Go to "Message" section
4. Set: `Content` → Use variable **{body}** not {message}
5. Set: `Sender` → Use variable **{from}** not {sender}
6. Save and test

### SMS to URL/HTTP Request
1. Open the rule
2. Set Method: POST
3. Set Content-Type: application/x-www-form-urlencoded
4. Set Parameters:
   - `sender` = %from%
   - `message` = %body%
   - `api_key` = YOUR_ACTUAL_API_KEY
5. Save

### SMS Gateway / SMS Forwarder API
1. Edit your rule
2. Change template from `{message}` to the app's actual variable
3. Common variables:
   - `%TEXT%`, `%BODY%`, `%%sms%%`
   - `%FROM%`, `%SENDER%`, `%%from%%`
4. Check app documentation for exact variable names

## Testing

### Step 1: Delete Old Placeholder Messages
```sql
DELETE FROM bank_sms_messages WHERE message_text LIKE '{%';
```

### Step 2: Send a Test SMS
1. Send yourself money on Telebirr (even 1 ETB)
2. Wait for SMS to arrive
3. Check if it forwards

### Step 3: Verify in Admin Panel
1. Go to Admin → Bank Integration
2. Scroll to "SMS Messages"
3. Click "Refresh"
4. You should see:
   - Real SMS text (not {message})
   - Amount extracted (e.g., "50.00 Birr")
   - Sender name and phone

## Still Not Working?

### Check These:

1. **Variable Names**: Different apps use different placeholders
   - Try: `{body}`, `{message}`, `%TEXT%`, `%%sms%%`
   - Try: `{from}`, `{sender}`, `%FROM%`, `%%from%%`

2. **App Permissions**: Make sure the app has:
   - SMS read permission ✓
   - Internet permission ✓
   - Background running permission ✓

3. **Test with Manual Entry**: While fixing the app, you can manually enter SMS messages:
   - Go to Admin → Bank Integration
   - Click "Add SMS" under "Manual SMS Entry"
   - Paste the full SMS text
   - System will auto-extract amount, name, phone

## What's Fixed Now

✓ Database trigger automatically extracts:
  - Amount (ETB/Birr)
  - Transaction reference
  - Sender name
  - Sender phone

✓ Manual verification will now show correct amounts

✓ Future SMS messages will work automatically once app is configured

## Need Help?

1. Take a screenshot of your SMS forwarding app configuration
2. Send a test SMS and check the forwarding app logs
3. Look for the actual variable names in your app's documentation
