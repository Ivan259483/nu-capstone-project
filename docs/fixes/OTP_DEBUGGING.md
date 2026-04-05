# 🔍 **OTP Debugging Guide**

## Step 1: Open Browser Console
1. Go to http://localhost:5173 (your frontend)
2. Press **F12** to open Developer Tools
3. Click **Console** tab
4. You should see detailed logs starting with `📝 [LOGIN]` and `📧 [EMAIL SERVICE]`

## Step 2: Try Signing Up
1. Fill in the sign-up form
2. Click "Send OTP"
3. Look at the console output carefully

You should see logs like:
```
📝 [LOGIN] Generated OTP: 123456
📧 [EMAIL SERVICE] Sending OTP via Backend API: {...}
📧 [EMAIL SERVICE] Request body: {...}
📧 [EMAIL SERVICE] Response status: 200 OK
📧 [EMAIL SERVICE] Response data: {success: true, message: "OTP sent successfully", ...}
📝 [LOGIN] EmailService response: {success: true}
```

## Step 3: Check Backend Logs
Also watch your backend terminal (should be running `node server.js`).

You should see:
```
✅ OTP stored in memory for test@example.com: {otp: '123456', ...}
✅ OTP email sent successfully: {to: 'test@example.com', ...}
✅ OTP sent successfully to test@example.com
```

## Alternative: Test with Simple HTML Page
Open: http://localhost:8000/otp-test.html

This is a minimal test page without React complexity. Try:
1. Enter your email
2. Click "Send OTP"
3. You'll see the response directly

## Common Issues

### "Failed to send OTP. Please try again."

**What to check:**

1. **Backend running?**
   ```bash
   lsof -i :3000 | grep LISTEN
   ```
   Should show: `node    12345 ivan   16u  IPv6 ... TCP *:3000 (LISTEN)`

2. **Frontend running?**
   ```bash
   lsof -i :5173 | grep LISTEN
   ```
   Should show something with port 5173

3. **Open browser console (F12)** and look for:
   - Network tab: Is the request being sent?
   - Console: Are there any errors?
   - Check the actual response from backend

4. **.env file has Brevo credentials?**
   ```bash
   cat /Users/ivan/Desktop/AutoSPF+/backend/.env | grep BREVO
   ```

### If Response Status is NOT 200

The backend might be returning an error. Check:
- Is MongoDB error being logged?
- Is email service failing?
- Check backend console output

### If Response is 200 but Still Says Failed

The JSON parsing might be failing. Check browser console for:
```
📧 [EMAIL SERVICE] Response data: null
```

This means the response wasn't valid JSON. The backend logs will show what was actually sent.

## Quick Diagnostic Command

Test the API directly:
```bash
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

Should see:
```json
{"success":true,"message":"OTP sent successfully","data":{"email":"test@example.com","expiresIn":600}}
```

## Restart Everything

If still stuck, restart from scratch:

**Terminal 1:**
```bash
cd /Users/ivan/Desktop/AutoSPF+/backend
node server.js
```

**Terminal 2:**
```bash
cd /Users/ivan/Desktop/AutoSPF+/autospf
npm run dev
```

Then:
1. Go to http://localhost:5173
2. Open F12 console
3. Try signing up
4. Post the console logs here and I can tell you exactly what's wrong

---

**The system is working - we just need to find where the issue is!** 🔧
