# 🎯 OFFLINE DEMO QUICK REFERENCE

## 📋 Demo Accounts

### Customer Account
```
Email: customer@test.com
Password: Password123
```

### Admin Account
```
Email: admin@test.com
Password: Password123
```

---

## 🚀 Pre-Demo Checklist

1. **MongoDB Running?**
   ```bash
   brew services list | grep mongodb
   # Should show: mongodb-community@7.0 started
   ```

2. **Backend Running?**
   ```bash
   cd /Users/ivan/Desktop/AutoSPF+/backend
   npm run dev
   # Should show: MongoDB Connected: 127.0.0.1
   ```

3. **Frontend Running?**
   ```bash
   cd /Users/ivan/Desktop/AutoSPF+/autospf
   npm run dev
   ```

---

## 🔐 OTP Demo Flow

### For Forgot Password:
1. Click "Forgot Password"
2. Enter: `customer@test.com`
3. **Look at backend terminal** for:
   ```
   ==================================================
   🔐 PASSWORD RESET OTP FOR customer@test.com: 123456
   ==================================================
   ```
4. Copy OTP from terminal and paste in frontend
5. Set new password

### For Registration (if needed):
1. Enter new user details
2. **Look at backend terminal** for OTP
3. Copy and paste OTP to verify

---

## 🧪 Demo Scenarios

### Scenario 1: Customer Login ✅
- Login with `customer@test.com`
- Show customer dashboard
- Browse services (5 available)
- Update profile settings

### Scenario 2: Admin Login ✅
- Login with `admin@test.com`
- Show admin dashboard
- Manage services
- View users

### Scenario 3: Account Lockout ✅
- Try wrong password 5 times
- Show lockout message (20 minutes)
- Backend shows: `🔒 [SECURITY]: Account locked`

### Scenario 4: Password Reset ✅
- Use "Forgot Password"
- Get OTP from backend terminal
- Reset password successfully

---

## 🛠️ Troubleshooting

### MongoDB not running?
```bash
brew services start mongodb-community
```

### Need to re-seed database?
```bash
cd /Users/ivan/Desktop/AutoSPF+/backend
node seed.js
```

### Backend not connecting?
Check `.env` file has:
```
MONGODB_URI=mongodb://127.0.0.1:27017/autospf
```

---

## 📊 Database Contents

**Users:** 2 (1 admin, 1 customer)  
**Services:** 5 car wash services  
**Prices:** ₱250 - ₱1200  

All data works **100% offline**! 🎉
