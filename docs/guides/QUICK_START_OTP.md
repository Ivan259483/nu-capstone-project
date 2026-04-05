# 🚀 **QUICK START - 30 SECONDS**

## Start Backend
```bash
cd /Users/ivan/Desktop/AutoSPF+/backend
node server.js
```

Wait for: `✅ Ready for OTP testing!`

## Start Frontend (New Terminal)
```bash
cd /Users/ivan/Desktop/AutoSPF+/autospf
npm run dev
```

Wait for: `Local: http://localhost:5173/`

## Test It!
1. Go to http://localhost:5173
2. Click "Sign Up"
3. Fill form with test data
4. Click "Send OTP"
5. **See success toast** ✅

If it says "Failed to send OTP":
- Check backend console for errors
- Check `.env` has Brevo credentials
- Make sure both servers are running on ports 3000 and 5173

---

**That's it! No MongoDB needed for development.** 🎉
