# Email Provider Switching Guide

## 🔄 How to Switch Between Email Providers

All providers are fully supported. Just update your `.env` file and restart.

---

## 🏆 Setup 1: BREVO (RECOMMENDED)

### .env Configuration:
```bash
EMAIL_PROVIDER=brevo
EMAIL_FROM_NAME=AutoSPF+
EMAIL_FROM_ADDRESS=noreply@autospf.com
BREVO_SMTP_USER=contact@autospf.com
BREVO_SMTP_PASSWORD=your_brevo_password
```

### Get Credentials:
1. Sign up: https://www.brevo.com
2. Dashboard → Settings → SMTP & API
3. Copy **SMTP Login** and **SMTP Password**

### Test:
```bash
npm run dev
# Should see: ✅ Email service verified and ready
```

---

## 💻 Setup 2: GMAIL (FALLBACK)

### .env Configuration:
```bash
EMAIL_PROVIDER=gmail
EMAIL_FROM_NAME=AutoSPF+
EMAIL_FROM_ADDRESS=noreply@autospf.com
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
```

### Get Credentials:
1. Go to: https://myaccount.google.com/security
2. Enable **2-Step Verification**
3. Go to: https://myaccount.google.com/apppasswords
4. Select: **Mail** → **Windows Computer** (or your device)
5. Copy the **16-character password**

### Important Notes:
- ⚠️ Limited to ~500 emails/day (rate limited by Google)
- ❌ Cannot use custom domain
- ✅ Good for development/testing
- ✅ Good as fallback provider

### Test:
```bash
npm run dev
# Should see: ✅ Email service verified and ready
```

---

## 🔌 Setup 3: GENERIC SMTP

### .env Configuration:
```bash
EMAIL_PROVIDER=smtp
EMAIL_FROM_NAME=AutoSPF+
EMAIL_FROM_ADDRESS=noreply@autospf.com
EMAIL_USER=your_smtp_username
EMAIL_PASSWORD=your_smtp_password
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
```

### Common SMTP Providers:
| Provider | Host | Port | TLS |
|----------|------|------|-----|
| SendGrid | smtp.sendgrid.net | 587 | true |
| MailerSend | smtp.mailersend.net | 587 | false |
| AWS SES | email-smtp.region.amazonaws.com | 587 | true |
| Mailgun | smtp.mailgun.org | 587 | false |

### Example: SendGrid
```bash
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
EMAIL_USER=apikey
EMAIL_PASSWORD=SG.your_sendgrid_api_key
```

---

## 🧪 Setup 4: DEVELOPMENT (CONSOLE)

### .env Configuration:
```bash
EMAIL_PROVIDER=console
EMAIL_FROM_NAME=AutoSPF+
EMAIL_FROM_ADDRESS=noreply@autospf.com
```

### Features:
- ✅ No external service needed
- ✅ Emails logged to console
- ✅ Perfect for testing
- ✅ No credentials needed

### Example Output:
```
📧 Email service in development mode (console)
✅ OTP email sent successfully:
   to: user@example.com
   from: noreply@autospf.com
   subject: Your OTP Code for AutoSPF+
   [Email would be sent here if production]
```

---

## 🔄 Switching Between Providers

### Step 1: Update .env
```bash
# Old
EMAIL_PROVIDER=gmail

# New
EMAIL_PROVIDER=brevo
BREVO_SMTP_USER=new_credentials
BREVO_SMTP_PASSWORD=new_password
```

### Step 2: Restart Server
```bash
# Stop current process: Ctrl+C
# Restart
npm run dev
```

### Step 3: Verify
```bash
# Should see verification message
✅ Email service verified and ready
```

### Step 4: Test
```bash
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

---

## 📊 Provider Comparison

| Feature | Brevo | Gmail | SMTP | Console |
|---------|-------|-------|------|---------|
| **Free** | 300/day | ~500/day | Varies | ∞ |
| **Custom Domain** | ✅ | ❌ | ✅ | N/A |
| **Professional** | ✅ | ⚠️ | ✅ | N/A |
| **Setup Time** | 5 min | 10 min | 15 min | 0 min |
| **Production Ready** | ✅ | ⚠️ | ✅ | ❌ |
| **Development** | ⚠️ | ✅ | ✅ | ✅ |

---

## 🎯 Recommendation Path

```
Development
    ↓
Use: EMAIL_PROVIDER=console
(No external service, instant)
    
    ↓ Ready to test with email?
    
    ↓
Use: EMAIL_PROVIDER=gmail
(Free, ~500/day, good for testing)
    
    ↓ Going live with custom domain?
    
    ↓
Use: EMAIL_PROVIDER=brevo (RECOMMENDED)
(Professional, 300/day free, custom domain)
    
    ↓ Scaling beyond 300/day?
    
    ↓
Use: Brevo Paid or Mailgun/SendGrid
(Dedicated email service providers)
```

---

## 🧪 Complete Test Workflow

### Test All Three Providers:

```bash
# 1. Setup Brevo (5 min)
# Update .env with BREVO credentials
EMAIL_PROVIDER=brevo
npm run dev

# Test send OTP
curl -X POST http://localhost:3000/api/auth/send-otp \
  -d '{"email":"test@example.com"}'
# ✅ Check email for OTP

# 2. Switch to Gmail (10 min)
# Update .env with GMAIL credentials
EMAIL_PROVIDER=gmail
npm run dev

# Test send OTP again
curl -X POST http://localhost:3000/api/auth/send-otp \
  -d '{"email":"test2@example.com"}'
# ✅ Check email for OTP

# 3. Test Console (instant)
# Update .env
EMAIL_PROVIDER=console
npm run dev

# Test send OTP
curl -X POST http://localhost:3000/api/auth/send-otp \
  -d '{"email":"test3@example.com"}'
# ✅ Email logged to console (not sent)
```

---

## 🔐 Security Best Practices

### 1. Never Commit Credentials
```bash
# ❌ BAD: Credentials in code
EMAIL_PASSWORD=mypassword123

# ✅ GOOD: Use .env file
# .env is in .gitignore
EMAIL_PASSWORD=set_in_env_only
```

### 2. Use App Passwords (Not Main Password)
```bash
# Gmail: Use 16-char app password
# Brevo: Use generated SMTP password
# Not: Personal account password
```

### 3. Rotate Credentials Regularly
```bash
# Periodically generate new:
- Gmail: New app password
- Brevo: New SMTP password
```

### 4. Monitor Sending
```bash
# Weekly check:
- Gmail: Check security alerts
- Brevo: Check bounce rate in dashboard
```

---

## 🚨 Troubleshooting Provider Issues

### "Email service error"
```bash
# Check current provider
grep EMAIL_PROVIDER .env

# Verify credentials are correct
# Restart server
npm run dev

# Check console logs
```

### "Failed to send OTP"
```bash
# Verify provider-specific credentials:
# Brevo: Check BREVO_SMTP_USER and BREVO_SMTP_PASSWORD
# Gmail: Check EMAIL_USER and EMAIL_PASSWORD
# SMTP: Check SMTP_HOST, SMTP_PORT, EMAIL_USER, EMAIL_PASSWORD
```

### Email not arriving
```bash
# Check in provider dashboard:
# Brevo: Settings → SMTP & API → Test SMTP
# Gmail: Activity log (https://myaccount.google.com/device-activity)

# Try different email address
# Check spam folder
# Verify sender email is in system
```

---

## 📋 Quick Reference: Environment Variables

```bash
# ======================
# Always Required
# ======================
EMAIL_PROVIDER=brevo|gmail|smtp|console
EMAIL_FROM_NAME=AutoSPF+
EMAIL_FROM_ADDRESS=noreply@autospf.com

# ======================
# Brevo Only
# ======================
BREVO_SMTP_USER=your_login
BREVO_SMTP_PASSWORD=your_password

# ======================
# Gmail Only
# ======================
EMAIL_USER=your@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx

# ======================
# Generic SMTP Only
# ======================
EMAIL_USER=username
EMAIL_PASSWORD=password
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false|true

# ======================
# Optional (All)
# ======================
OTP_EXPIRY=600
OTP_LENGTH=6
```

---

## ✅ Checklist: Switching Providers

- [ ] Updated `.env` file with new credentials
- [ ] Restarted server: `npm run dev`
- [ ] Saw: ✅ Email service verified and ready
- [ ] Tested with curl/Postman
- [ ] Received test email
- [ ] Verified email in provider dashboard

---

## 🎓 Next Steps

1. **Choose a provider** (Brevo recommended)
2. **Get credentials** (5-15 minutes)
3. **Update .env** (2 minutes)
4. **Restart backend** (1 minute)
5. **Test** (1 minute)
6. **Monitor** (ongoing)

**Total setup time: 10-20 minutes** ⏱️

---

For detailed setup of each provider, see:
- Brevo: `BREVO_SETUP_GUIDE.md`
- All providers: `EMAIL_QUICK_REFERENCE.md`
