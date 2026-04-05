# Email Service Quick Reference

## 📊 Service Comparison

| Feature | Brevo | Gmail | Mailgun |
|---------|-------|-------|---------|
| **Free Tier** | 300/day | Unlimited* | 5K/month |
| **Cost** | €20/mo after | Free | $35/mo |
| **Custom Domain** | ✅ Yes | ❌ No | ✅ Yes |
| **Professional** | ✅ Yes | ⚠️ Not ideal | ✅ Yes |
| **Setup Time** | ⏱️ 5 min | ⏱️ 10 min | ⏱️ 15 min |
| **Deliverability** | 📊 Excellent | 📊 Good | 📊 Excellent |
| **Support** | ✅ Good | ⚠️ Limited | ✅ Excellent |

*Gmail: Limited to ~500/day with app password (rate limited)

---

## 🎯 Recommended: Brevo

**Best for startups because:**
- ✅ 300 free emails/day (plenty for MVP)
- ✅ Custom domain support (professional)
- ✅ Excellent reputation (high deliverability)
- ✅ Easy SMTP setup (no DNS validation)
- ✅ Great dashboard (monitor sends)

---

## ⚡ Instant Setup (Copy-Paste)

### 1. Install:
```bash
cd backend && npm install nodemailer
```

### 2. Get Brevo Credentials:
```
1. Sign up: https://www.brevo.com
2. Dashboard → Settings → SMTP & API
3. Copy SMTP Login & Password
```

### 3. Update .env:
```bash
EMAIL_PROVIDER=brevo
EMAIL_FROM_NAME=AutoSPF+
EMAIL_FROM_ADDRESS=noreply@autospf.com
BREVO_SMTP_USER=contact@autospf.com
BREVO_SMTP_PASSWORD=your_password_here
```

### 4. Test:
```bash
npm run dev
# Should show: ✅ Email service verified and ready
```

### 5. Send OTP:
```bash
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com"}'
```

---

## 🔄 Email Flow

```
User Signup
    ↓
[POST /api/auth/send-otp]
    ↓
Generate 6-digit OTP
    ↓
Save to MongoDB (TTL: 10 min)
    ↓
Send via Brevo SMTP
    ↓
User receives email in 5-10s
    ↓
[POST /api/auth/verify-otp]
    ↓
Check OTP validity
    ↓
[POST /api/auth/register]
    ↓
Create user account
    ↓
Return JWT token
```

---

## 📧 Current Configuration

**Primary:** Brevo (300/day free)  
**Fallback:** Gmail (if Brevo fails)  
**Development:** Console (logging only)

---

## 🛠️ Provider Configuration

### Brevo:
```javascript
{
  provider: 'brevo',
  smtpHost: 'smtp-relay.brevo.com',
  port: 587,
  user: 'contact@autospf.com',
  pass: 'your_brevo_password'
}
```

### Gmail:
```javascript
{
  provider: 'gmail',
  service: 'gmail',
  user: 'your@gmail.com',
  pass: 'xxxx xxxx xxxx xxxx' // 16-char app password
}
```

### Generic SMTP:
```javascript
{
  provider: 'smtp',
  host: 'smtp.example.com',
  port: 587,
  user: 'username',
  pass: 'password'
}
```

---

## 📧 Email Templates

All emails include:
- ✅ Professional HTML layout
- ✅ Brand colors (AutoSPF+)
- ✅ Clear call-to-action buttons
- ✅ Mobile responsive design
- ✅ Plain text fallback

**Current Templates:**
1. OTP Code Email
2. Email Verification
3. Password Reset

---

## 🔐 Security Features

- ✅ OTP expires after 10 minutes
- ✅ Max 5 failed attempts per OTP
- ✅ Auto-delete expired OTPs (TTL index)
- ✅ No OTP stored in user password
- ✅ SMTP password never logged
- ✅ TLS encryption (port 587)

---

## 📊 Monitoring

**Brevo Dashboard:**
- Email delivery status
- Open/click rates
- Bounce rates
- Contact list management

**Backend Logs:**
```bash
✅ Email service verified and ready
✅ OTP email sent successfully to: user@email.com
❌ Failed to send OTP email: [error message]
```

---

## 🚨 Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| Email not sent | Check SMTP credentials |
| Email in spam | Verify SPF/DKIM records |
| "Email service error" | Restart: `npm run dev` |
| 5+ failed attempts | User must request new OTP |
| OTP expired | Expired OTPs auto-delete |

---

## 📱 Test Emails

**Send Test OTP:**
```bash
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "email": "test@example.com",
    "expiresIn": 600
  }
}
```

---

## 🎓 Next Steps

1. ✅ Set up Brevo account
2. ✅ Get SMTP credentials
3. ✅ Update .env file
4. ✅ Restart backend
5. ✅ Send test OTP
6. ⬜ (Optional) Add custom domain
7. ⬜ (Optional) Monitor in Brevo Dashboard

---

**Everything is configured and ready to use!** 🚀

For detailed setup, see: `BREVO_SETUP_GUIDE.md`
