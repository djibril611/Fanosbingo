# Quick Setup Guide for Android Phone

## What You Need
- Android phone
- SIM card with creator's number
- Internet connection
- 15 minutes

## Step 1: Install App
1. Open Play Store
2. Search "SMS to URL"
3. Install any SMS forwarder app
4. Grant SMS permission when asked

## Step 2: Get Credentials from Admin Panel
1. Open admin panel on computer
2. Click "SMS Monitor" button
3. You'll see:
   - **API URL:** `https://...supabase.co/functions/v1/receive-bank-sms`
   - **API Key:** Long string of letters/numbers
4. Keep this page open or copy both values

## Step 3: Configure App

### Create New Rule
Open the SMS forwarder app and create a new forwarding rule:

**Basic Settings:**
- **Name:** Telebirr to Server
- **Sender Filter:** `127`
- **When:** All messages from this sender

**HTTP Settings:**
- **Method:** POST
- **URL:** [Paste the API URL from Step 2]
- **Content Type:** application/json

**Body Template:**
```json
{
  "sender": "{{sender}}",
  "message": "{{message}}",
  "timestamp": "{{timestamp}}",
  "api_key": "PASTE_YOUR_API_KEY_HERE"
}
```

**Replace** `PASTE_YOUR_API_KEY_HERE` with the actual API key from Step 2.

### Enable Auto-Start
1. Go to app settings
2. Turn on "Start on boot"
3. Turn on "Run in background"

### Disable Battery Optimization
1. Go to phone Settings → Apps → Your SMS Forwarder App
2. Battery → Unrestricted (or Disable battery optimization)
3. This prevents Android from stopping the app

## Step 4: Test
1. Send a small test transfer to the creator's account
2. Wait for SMS to arrive on phone
3. Check admin panel → SMS Monitor
4. You should see the message appear within seconds

## Troubleshooting

**Problem:** SMS not appearing in admin panel
- Check phone has internet connection
- Verify the API key is correct (no spaces)
- Make sure sender filter is exactly `127`
- Check app has SMS permission

**Problem:** App stops working after reboot
- Enable "Start on boot" in app settings
- Disable battery optimization
- Add app to protected/locked apps list (varies by phone brand)

**Problem:** Connection error
- Double-check the API URL is complete and correct
- Verify internet connection works (open browser)
- Check if WiFi or mobile data is enabled

## Important Tips

1. **Keep Phone Charged:** Plug it into power or keep battery above 20%
2. **Stable Internet:** Use WiFi for reliability
3. **Test Regularly:** Send test SMS weekly to verify it's working
4. **Backup Method:** Remember you can always enter SMS manually in admin panel

## Phone Placement
- Keep phone in a location with good cell signal
- Near WiFi router for stable connection
- Plugged into power source
- Accessible for troubleshooting

## What Happens When SMS Arrives

1. Telebirr sends SMS to your phone (sender: 127)
2. SMS forwarder app detects it
3. App immediately sends to your server
4. Server stores and parses the SMS
5. Admin can see it in SMS Monitor
6. Admin marks it as processed after reviewing

## Example SMS Format

```
Dear Customer, You have received ETB 100.00
from John Doe 0912345678.
Transaction number: TBR123456789.
```

Server automatically extracts:
- Amount: 100.00
- Sender: John Doe
- Phone: 0912345678
- Transaction: TBR123456789

## Questions?

Check the SMS Setup Guide section in the admin panel for:
- Complete setup instructions
- Troubleshooting tips
- Configuration examples
- Security best practices

---

**Setup Time:** ~15 minutes
**Difficulty:** Easy
**Once setup, it runs automatically!**
