# Email Service Setup Guide - Brevo (Sendinblue)

## 🚀 Quick Start (5 minutes)

### Why Brevo?
✅ **300 emails/day** (free tier - enough for startups)  
✅ **Custom domain support** - Send from noreply@autospf.com  
✅ **Excellent deliverability** - Industry-leading reputation  
✅ **Easy setup** - No DNS validation required for SMTP  
✅ **Professional** - Used by Fortune 500 companies  

---

## 📋 Step 1: Create Brevo Account (2 minutes)

1. Go to **https://www.brevo.com**
2. Click **"Sign up for free"**
3. Enter your email and password
4. Verify your email
5. Complete account setup (name, company, etc.)

---

## 🔑 Step 2: Get SMTP Credentials (3 minutes)

### From Dashboard:
1. Login to Brevo Dashboard: https://app.brevo.com
2. Click **Settings** (bottom left gear icon)
3. Select **SMTP & API**
4. You'll see:
   - **SMTP Login** = your Brevo email or username
   - **SMTP Password** = generated password

### Generate SMTP Password (if needed):
1. In SMTP & API section, look for **"Generate new password"**
2. Click it to create a new SMTP password
3. Copy it immediately (you won't see it again!)

### Example Credentials:
```
SMTP Server:   smtp-relay.brevo.com
Port:          587 (TLS)
Login:         contact@yourdomain.com (or your Brevo email)
Password:      xxxxxxxxxxxxxxxxxxx
```

---

## 📧 Step 3: Setup Custom Domain (Optional but Recommended)

### To Send from noreply@autospf.com:

1. In Brevo Dashboard → **Senders & Domains**
2. Click **"Add a sender"** or **"Add a domain"**
3. Enter your domain: **autospf.com**
4. Verify domain ownership:
   - Add DNS record (Brevo will provide CNAME)
   - Wait 24-48 hours for verification
5. Once verified, use as sender email

### Without Custom Domain:
- Send from: `noreply@your-brevo-email.com`
- Update `EMAIL_FROM_ADDRESS` in .env accordingly

---

## ⚙️ Step 4: Configure Your Application

### 1. Install Dependencies:
```bash
cd /Users/ivan/Desktop/AutoSPF+/backend
npm install nodemailer
```

### 2. Update .env File:
```bash
cp .env.example .env
```

### 3. Edit .env with Brevo Credentials:
```bash
# EMAIL CONFIGURATION
EMAIL_PROVIDER=brevo
EMAIL_FROM_NAME=AutoSPF+
EMAIL_FROM_ADDRESS=noreply@autospf.com

# BREVO CREDENTIALS
BREVO_SMTP_USER=contact@autospf.com
BREVO_SMTP_PASSWORD=your_smtp_password_from_brevo
BREVO_API_KEY=optional_api_key

# Keep Gmail as fallback (optional)
EMAIL_USER=your_backup_email@gmail.com
EMAIL_PASSWORD=your_gmail_app_password
```

### 4. Start Your Server:
```bash
npm run dev
```

You should see: ✅ Email service verified and ready

---

## 🧪 Step 5: Test Email Sending

### Using cURL:
```bash
# 1. Request OTP
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Expected response:
# {
#   "success": true,
#   "message": "OTP sent successfully",
#   "data": { "email": "test@example.com", "expiresIn": 600 }
# }

# 2. Check your email for OTP code
# Should arrive within 5-10 seconds

# 3. Verify OTP
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","otp":"123456"}'

# 4. Complete signup
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name":"John Doe",
    "email":"test@example.com",
    "password":"secure123",
    "role":"customer"
  }'
```

### Using Postman:
1. Import the requests from the cURL examples above
2. Set `{{BASE_URL}}` = http://localhost:3000
3. Test each endpoint

---

## 📊 Monitor Email Delivery

### In Brevo Dashboard:
1. Go to **Emails** → **Sent emails**
2. See all emails sent with delivery status
3. Check bounce rates and open rates
4. View detailed logs for each email

---

## 🔧 Switching Providers

### Switch to Gmail (Fallback):
```bash
EMAIL_PROVIDER=gmail
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
```

### Switch to Generic SMTP:
```bash
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.your-server.com
SMTP_PORT=587
SMTP_SECURE=false
EMAIL_USER=your_smtp_username
EMAIL_PASSWORD=your_smtp_password
```

### Development Mode (Console):
```bash
EMAIL_PROVIDER=console
# Emails logged to console instead of being sent
```

---

## 📋 Environment Variables Reference

| Variable | Required | Example | Purpose |
|----------|----------|---------|---------|
| `EMAIL_PROVIDER` | Yes | `brevo` | Email service provider |
| `EMAIL_FROM_NAME` | Yes | `AutoSPF+` | Sender display name |
| `EMAIL_FROM_ADDRESS` | Yes | `noreply@autospf.com` | Sender email address |
| `BREVO_SMTP_USER` | Yes (if Brevo) | `contact@autospf.com` | Brevo SMTP login |
| `BREVO_SMTP_PASSWORD` | Yes (if Brevo) | `xxx...` | Brevo SMTP password |
| `BREVO_API_KEY` | No | `xxx...` | For advanced Brevo features |
| `EMAIL_USER` | If Gmail | `you@gmail.com` | Gmail address |
| `EMAIL_PASSWORD` | If Gmail | `xxxx xxxx xxxx xxxx` | Gmail app password |
| `OTP_EXPIRY` | Yes | `600` | OTP validity (seconds) |
| `OTP_LENGTH` | Yes | `6` | OTP digit length |

---

## ❌ Troubleshooting

### Issue: "Failed to send OTP"
**Solutions:**
1. Check `BREVO_SMTP_USER` and `BREVO_SMTP_PASSWORD` in .env
2. Verify credentials in Brevo Dashboard
3. Check internet connection
4. Try restart: `npm run dev`

### Issue: Email not arriving
**Solutions:**
1. Check spam/junk folder
2. Verify `EMAIL_FROM_ADDRESS` is correct
3. Check Brevo Dashboard → **Emails** → **Sent** for delivery status
4. Look for bounce errors

### Issue: "Email service error"
**Solutions:**
1. Ensure `npm install` was run
2. Check `EMAIL_PROVIDER` value in .env
3. Verify SMTP credentials are correct
4. Check firewall/proxy settings (port 587 must be open)

### Issue: SMTP Connection Failed
**Solutions:**
```bash
# Verify credentials:
telnet smtp-relay.brevo.com 587

# Check logs:
NODE_ENV=development npm run dev
# Look for detailed error messages
```

---

## 📈 Scaling Up (When You Outgrow Free Tier)

### Brevo Paid Plans:
- **Starter**: €20/month (20K emails)
- **Pro**: €48/month (100K emails)
- **Enterprise**: Custom pricing

### Alternative: Upgrade to Mailgun
```bash
EMAIL_PROVIDER=mailgun
MAILGUN_API_KEY=your_key
MAILGUN_DOMAIN=mail.autospf.com
```

---

## 🎯 Best Practices

1. **Always use custom domain** - Better deliverability
2. **Monitor bounce rates** - Keep below 2%
3. **Test before launch** - Verify emails reach inbox
4. **Set up SPF/DKIM** - Improves authentication
5. **Use descriptive names** - `"AutoSPF+ Team" <noreply@...>`
6. **Handle failures gracefully** - Implement retry logic

---

## 📞 Support

- **Brevo Help**: https://help.brevo.com
- **Email Issues**: Check spam folder, verify SPF/DKIM records
- **API Errors**: See Brevo Dashboard → **Emails** → **Logs**

---

## ✅ Setup Checklist

- [ ] Created Brevo account
- [ ] Got SMTP credentials
- [ ] Installed nodemailer: `npm install nodemailer`
- [ ] Updated .env with BREVO credentials
- [ ] Restarted server: `npm run dev`
- [ ] Tested email with cURL or Postman
- [ ] Received OTP email
- [ ] Checked spam folder
- [ ] Verified email in Brevo Dashboard

---

**You're all set!** 🚀 Your app is now sending professional emails from your domain.
