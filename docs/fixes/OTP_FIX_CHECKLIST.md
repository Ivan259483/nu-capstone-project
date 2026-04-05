# ✅ OTP System - Quick Verification Checklist

## Before Starting

- [ ] MongoDB is running locally
- [ ] No services using ports 3000 (backend) or 5173 (frontend)

## Fix Applied

- [x] Frontend: `/autospf/src/lib/email-service.ts` - Now calls backend API
- [x] Frontend: `/autospf/src/pages/Login.tsx` - Now verifies OTP with backend
- [x] Backend: Already has all necessary endpoints and Brevo config

## Startup Procedure

### Terminal 1: Start Backend

```bash
cd /Users/ivan/Desktop/AutoSPF+/backend
npm run dev
```

Wait for:
```
✅ Server running on port 3000
✅ Email service verified and ready
```

### Terminal 2: Start Frontend

```bash
cd /Users/ivan/Desktop/AutoSPF+/autospf
npm run dev
```

Wait for:
```
VITE v7.x.x  ready in XXX ms

➜  Local:   http://localhost:5173/
```

## Test OTP Flow

1. Open http://localhost:5173 in browser
2. Click **Sign Up**
3. Fill in:
   - Name: `Test User`
   - Email: `test@example.com`
   - Password: `TestPass123!`
   - Confirm: `TestPass123!`
4. Click **Send OTP**
5. Should see: ✅ "OTP sent to your email!"
6. Check MongoDB for OTP or check email
7. Enter OTP and click **Verify**
8. Should see: ✅ "Account created successfully!"

## API Test (Without UI)

### Send OTP
```bash
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "ivan@example.com"}'
```

Should return:
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "email": "ivan@example.com",
    "expiresIn": 600
  }
}
```

### Verify OTP
Get the OTP (from MongoDB), then:

```bash
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "ivan@example.com", "otp": "123456"}'
```

## Troubleshooting

### Error: "Could not reach server: connect ECONNREFUSED"

**Fix**: Backend not running
```bash
cd /Users/ivan/Desktop/AutoSPF+/backend
npm run dev
```

### Error: "Failed to send OTP. Please try again."

**Check**:
1. Backend logs for email errors
2. MongoDB is running: `mongosh`
3. Brevo credentials in `.env`:
   ```bash
   cat /Users/ivan/Desktop/AutoSPF+/backend/.env | grep BREVO
   ```

### Frontend shows blank page

**Check**:
1. Frontend is running: `npm run dev` in `/autospf`
2. Check console for errors: F12 → Console tab
3. Clear browser cache: Cmd+Shift+Delete

## Configuration Verified

- [x] Backend `.env` has BREVO_SMTP_USER and BREVO_SMTP_PASSWORD
- [x] Backend `.env` has EMAIL_FROM_ADDRESS=noreply@autospf.com
- [x] Frontend `.env.local` has VITE_API_URL=http://localhost:3000
- [x] Backend CORS allows http://localhost:5173
- [x] OTP expires in 600 seconds (10 minutes)
- [x] OTP length is 6 digits

## Success Indicators

✅ Backend logs show:
```
✅ OTP email sent successfully: {
  to: 'user@example.com',
  from: 'noreply@autospf.com',
  messageId: '...'
}
```

✅ Frontend shows success toast
✅ Email received (or visible in MongoDB)
✅ User can verify OTP

---

## Files Changed in This Fix

1. **Frontend Email Service**
   - Path: `/autospf/src/lib/email-service.ts`
   - Change: Now POSTs to backend instead of EmailJS
   - Impact: OTP actually gets sent via Brevo

2. **Frontend OTP Verification**
   - Path: `/autospf/src/pages/Login.tsx`
   - Change: Verifies OTP with backend, not local storage
   - Impact: Server-side validation, proper security

3. **Backend Files** (No changes - already correct)
   - `/backend/controllers/authController.js` ✅
   - `/backend/routes/auth.js` ✅
   - `/backend/utils/emailService.js` ✅
   - `/backend/.env` ✅

---

## Performance Notes

- OTP expires in 10 minutes (configurable in `.env`)
- Maximum 5 attempts before OTP expires
- Emails queued to prevent rate limiting
- Database TTL auto-deletes expired OTPs

---

**Status**: ✅ **FIXED AND READY FOR TESTING**

See `OTP_DIAGNOSTIC_AND_FIX.md` for detailed diagnosis and explanation.
