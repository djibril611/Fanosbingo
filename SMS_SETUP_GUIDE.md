# SMS Forwarding System Setup Guide

This guide explains how to set up automatic SMS forwarding from your phone to the server for processing Telebirr payment confirmations.

## System Overview

The SMS forwarding system automatically captures payment confirmation SMS messages from Telebirr (sender: 127) and forwards them to your server. The server then:
- Stores the SMS in the database
- Automatically extracts transaction details (amount, transaction number, sender info)
- Makes the data available in the admin panel for processing

## Setup Methods

### Method 1: Android with SMS Forwarder App (Recommended)

This is the easiest and most reliable method.

#### Requirements
- Android phone (any version, can be an old device)
- SIM card with the creator's phone number (that receives payment confirmations)
- Internet connection (WiFi or mobile data)
- SMS forwarder app from Play Store

#### Step-by-Step Setup

1. **Install SMS Forwarder App**
   - Open Google Play Store on your Android phone
   - Search for "SMS to URL" or "SMS Forwarder"
   - Recommended apps:
     - "SMS to URL" by Bogdan Evtushenko
     - "SMS Gateway" by Capcom
     - "HTTP SMS" by Bogdan
   - Install and open the app

2. **Get Your API Credentials**
   - Open the admin panel in your web browser
   - Click "SMS Monitor" button
   - Copy the API Endpoint URL and API Key shown in the setup guide

3. **Configure the App**

   Create a new forwarding rule with these settings:

   - **Filter/Sender:** `127` (only forward messages from Telebirr)
   - **HTTP Method:** `POST`
   - **URL:** `https://your-project.supabase.co/functions/v1/receive-bank-sms`
   - **Content-Type:** `application/json`
   - **Body Template:**
     ```json
     {
       "sender": "{{sender}}",
       "message": "{{message}}",
       "timestamp": "{{timestamp}}",
       "api_key": "YOUR_API_KEY_HERE"
     }
     ```

   Note: Replace `YOUR_API_KEY_HERE` with the actual API key from the admin panel.

4. **Enable Auto-Start**
   - Go to app settings
   - Enable "Start on boot" or "Auto-start"
   - Disable battery optimization for the app (to prevent Android from killing it)

5. **Test the Setup**
   - Send a small test transfer to the creator's account
   - Wait for the SMS to arrive
   - Check the admin panel → SMS Monitor to see if the message appears
   - If successful, you're all set!

#### Troubleshooting
- **SMS not forwarding:** Check that the app has SMS read permission
- **App stops working:** Disable battery optimization for the app
- **Connection errors:** Verify the API URL and API key are correct
- **Phone offline:** Ensure WiFi or mobile data is enabled

### Method 2: Manual Entry (Backup Method)

If automatic forwarding isn't working or you need to add messages manually:

1. **Open Admin Panel**
   - Go to your admin panel
   - Click "SMS Monitor"
   - Click "Add SMS" in the Manual SMS Entry section

2. **Enter SMS Details**
   - Sender: Enter `127` (for Telebirr)
   - Message: Copy and paste the entire SMS text from your phone
   - Click "Add SMS"

3. **Automatic Processing**
   - The system will automatically extract transaction details
   - View the processed message in the SMS History section

## Using the Admin Panel

### SMS Setup Guide
Shows:
- API endpoint URL
- API key for authentication
- Step-by-step setup instructions
- Configuration examples

### Manual SMS Entry
Use this to:
- Add SMS messages manually when automatic forwarding fails
- Test the system with sample SMS
- Handle edge cases

### SMS History
Displays:
- All received SMS messages
- Extracted transaction details (amount, transaction number, sender)
- Processing status (pending or processed)
- Filter by status (all, pending, processed)

#### Processing Messages
1. Click on a pending message
2. Add optional notes (e.g., "Credited to user @username")
3. Click "Mark as Processed"
4. The message moves to processed status

## Database Structure

### Table: `bank_sms_messages`

Stores all received SMS messages with these fields:

| Field | Type | Description |
|-------|------|-------------|
| sender | text | SMS sender (should be "127" for Telebirr) |
| message_text | text | Full SMS message content |
| received_at | timestamp | When the SMS was received |
| transaction_number | text | Auto-extracted (e.g., TBR123456) |
| amount | numeric | Auto-extracted amount in Birr |
| sender_name | text | Auto-extracted sender name |
| sender_phone | text | Auto-extracted sender phone |
| is_processed | boolean | Whether admin has reviewed it |
| processed_at | timestamp | When it was marked processed |
| notes | text | Admin notes |

## Edge Function: `receive-bank-sms`

Endpoint: `https://your-project.supabase.co/functions/v1/receive-bank-sms`

### Request Format
```json
{
  "sender": "127",
  "message": "Full SMS text here",
  "timestamp": "2025-12-15T12:00:00Z",
  "api_key": "your-api-key"
}
```

### Response Format
```json
{
  "success": true,
  "message": "SMS received and stored successfully",
  "sms_id": "uuid-here",
  "parsed_amount": 100.00,
  "parsed_transaction": "TBR123456789"
}
```

### Security Features
- API key authentication
- Duplicate detection (prevents same message being added twice)
- Automatic data validation
- Secure storage with RLS policies

## SMS Parsing

The system automatically extracts these details from Telebirr SMS:

1. **Transaction Number**
   - Pattern: `TBR` followed by digits
   - Example: TBR123456789

2. **Amount**
   - Looks for: "ETB", "Birr", or "transferred" followed by numbers
   - Example: "ETB 100.00" → 100.00

3. **Sender Phone**
   - Pattern: 09 followed by 8 digits
   - Example: 0912345678

4. **Sender Name**
   - Extracted from the message text
   - Usually appears after "from"

## Best Practices

### Phone Setup
- Use a dedicated Android phone for SMS forwarding
- Keep it plugged into power
- Use WiFi for stable connection
- Disable automatic updates that might restart the phone
- Set up remote access (TeamViewer) for remote management

### Security
- Keep your API key secret
- Only share the API key with trusted team members
- Regularly review SMS logs for suspicious activity
- Change API key if compromised (contact support)

### Monitoring
- Check the admin panel daily
- Process pending SMS messages promptly
- Keep notes for audit trail
- Monitor for missing SMS (indicates forwarding issue)

### Backup
- Keep manual entry available as backup
- Train team members on manual entry process
- Have multiple team members who can access admin panel
- Document any custom SMS formats or special cases

## Getting Help

If you encounter issues:

1. **Check the Basics**
   - Is the phone connected to internet?
   - Is the SMS forwarder app running?
   - Is the API key correct?

2. **Review Logs**
   - Check SMS History for any error messages
   - Look at the forwarder app logs
   - Check your browser console for errors

3. **Test Components**
   - Send a test SMS manually to verify forwarding
   - Try manual entry to verify the endpoint works
   - Check that the phone can reach the internet

4. **Common Solutions**
   - Restart the SMS forwarder app
   - Verify battery optimization is disabled
   - Check that WiFi/data is enabled
   - Confirm the API key hasn't changed

## Maintenance

### Weekly
- Review processed SMS messages
- Check for any pattern issues (incorrect parsing)
- Verify phone is still forwarding correctly

### Monthly
- Review all pending SMS and process them
- Check phone battery and connectivity
- Update SMS forwarder app if needed
- Review API key security

### As Needed
- Update configuration if bank SMS format changes
- Add new parsing patterns for new SMS formats
- Train new team members on the system
- Document any issues and solutions

---

**System Status:** ✅ Fully Operational
**Last Updated:** December 15, 2024
**Version:** 1.0
