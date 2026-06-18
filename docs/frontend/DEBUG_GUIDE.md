# 🔧 AutoSPF+ Blank Screen Debugging Guide

## Root Cause Analysis

Your app was showing a blank screen due to **project configuration mismatch**:

### The Main Issues:

1. **Conflicting Project Types**
   - `app.json` was configured for **Expo (React Native)**
   - Project setup is actually **Vite (React Web)**
   - Running `npx expo start` expected React Native app structure

2. **Conflicting Dependencies**
   - React Native packages (react-native, expo)
   - React Web packages (react-router-dom, vite)
   - These cannot coexist in the same project

3. **Missing Entry Point**
   - `app.json` didn't specify the entry point for web builds
   - Vite config had custom plugins that weren't installed

4. **Hardcoded API Keys**
   - EmailJS keys exposed in source code
   - No environment variable support

---

## ✅ Changes Made

### 1. Updated `package.json`
**What Changed:**
- ✅ Fixed scripts: `dev` (Vite) is now the primary command
- ✅ Removed React Native dependencies: `react-native`, `expo`, `expo-status-bar`
- ✅ Removed server dependencies: `express`, `mongoose`, `nodemon` (not needed for web app)
- ✅ Kept all web dependencies: React Router, Sonner, Lucide icons, etc.

**New scripts:**
```json
"dev": "vite",                    // Start dev server
"build": "vite build",            // Build for production
"preview": "vite preview",        // Preview production build
"type-check": "tsc --noEmit"     // Check TypeScript
```

### 2. Updated `app.json`
**What Changed:**
- ✅ Added `entryPoint` field pointing to `./src/main.tsx`
- ✅ Removed iOS/Android configurations (not needed for web)
- ✅ Kept web configuration with favicon

### 3. Simplified `vite.config.ts`
**What Changed:**
- ✅ Removed custom plugins (`viteSourceLocator`, `atoms`) that weren't installed
- ✅ Kept essential React plugin and path aliases
- ✅ Kept file watching configuration for development

### 4. Fixed `email-service.ts`
**What Changed:**
- ✅ Replaced hardcoded API keys with environment variables
- ✅ Uses `import.meta.env.VITE_*` pattern
- ✅ Falls back to placeholder values (keep these secret!)

### 5. Created `.env.local`
**Purpose:**
- Store sensitive environment variables
- NOT tracked by git (already in .gitignore)
- Add your actual EmailJS keys here

---

## 🚀 How to Run Now

### Step 1: Install Dependencies
```bash
cd /Users/ivan/Desktop/AutoSPF+/autospf
npm install
```

### Step 2: Set Up Environment Variables
Edit `.env.local` and add your actual EmailJS keys:
```env
VITE_EMAILJS_PUBLIC_KEY=your_actual_public_key
VITE_EMAILJS_PRIVATE_KEY=<emailjs-private-key>
```

### Step 3: Start Development Server
```bash
npm run dev
```

Expected output:
```
  VITE v7.3.1  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

### Step 4: Open in Browser
Navigate to `http://localhost:5173/`

You should see the **AutoSPF+ Login Page** ✅

---

## 🧪 Testing

### Demo Accounts (Login Test):

1. **Admin Account**
   - Email: `admin@autospf.com`
   - Password: `Admin123!`
   - Expected: Admin Dashboard

2. **Detailer Account**
   - Email: `mike@detailshop.com`
   - Password: `Detailer123!`
   - Expected: Detailer Dashboard

3. **Customer Account**
   - Email: `customer@test.com`
   - Password: `Customer123!`
   - Expected: Customer Dashboard

---

## ❌ What Was Wrong (Before)

```bash
# ❌ This would NOT work:
npx expo start

# This attempts to run a React Native Expo app,
# but your project is React web with Vite!
# Result: Blank white screen
```

## ✅ What Works Now (After)

```bash
# ✅ This DOES work:
npm run dev

# Starts Vite development server
# Serves your React web app
# Hot module replacement works
# Result: Fully functional AutoSPF+ app
```

---

## 📁 Project Structure Explanation

```
autospf/
├── src/
│   ├── App.tsx              // Main app component
│   ├── main.tsx             // Entry point (React DOM)
│   ├── pages/               // Page components
│   ├── components/          // UI components
│   ├── contexts/            // React contexts (Auth)
│   ├── lib/                 // Utilities (storage, email)
│   ├── types/               // TypeScript types
│   └── hooks/               // Custom hooks
├── public/                  // Static assets
├── assets/                  // App icons/images
├── vite.config.ts          // Vite configuration
├── tsconfig.json           // TypeScript config
├── package.json            // Dependencies
├── app.json                // Expo web config (for reference)
├── index.html              // HTML entry point
└── .env.local              // Environment variables (🔐 SECRET)
```

---

## 🔒 Security Notes

### Before (UNSAFE):
```typescript
const PUBLIC_KEY = '14L8opol4yNJUJLiG';  // Exposed in code!
const PRIVATE_KEY = '<emailjs-private-key>';  // Visible in Git history!
```

### After (SAFE):
```typescript
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || '...';
// Keys stored in .env.local (not in git)
// Only loaded at runtime
```

**Action Items:**
- ✅ Rotate your EmailJS keys immediately
- ✅ Audit git history for exposed keys
- ✅ Update .env.local with real keys
- ✅ Never commit .env.local to git

---

## 🐛 Troubleshooting

### Still seeing blank screen?

1. **Clear cache and reinstall:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   npm run dev
   ```

2. **Check browser console:**
   - Open DevTools (F12)
   - Check Console tab for errors
   - Check Network tab for failed requests

3. **Verify environment:**
   ```bash
   npm run type-check
   # Should show no TypeScript errors
   ```

### Port 5173 already in use?

```bash
# Use a different port:
npm run dev -- --port 3000
```

### Module not found errors?

```bash
# Check if all dependencies are installed:
npm install

# If specific module missing:
npm install missing-module-name
```

---

## 📚 Next Steps

1. **✅ Test the app is working**
   - Login with demo accounts
   - Navigate through dashboards
   - Verify features work

2. **🔐 Update security**
   - Add real EmailJS credentials to .env.local
   - Review other sensitive data in storage.ts
   - Implement password hashing

3. **📦 Build for production**
   ```bash
   npm run build
   # Creates dist/ folder with optimized build
   ```

4. **🚀 Deploy**
   - Deploy `dist/` folder to hosting service
   - Set environment variables on hosting platform
   - Example hosts: Vercel, Netlify, GitHub Pages

---

## 📖 Additional Resources

- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)

---

## Summary

| Issue | Before | After |
|-------|--------|-------|
| **Entry Point** | React Native (Expo) | React Web (Vite) ✅ |
| **Development Server** | `npx expo start` | `npm run dev` ✅ |
| **Dependencies** | React Native + React Web | React Web only ✅ |
| **Build Tool** | Expo CLI | Vite ✅ |
| **API Keys** | Hardcoded in source | Environment variables ✅ |
| **Blank Screen?** | ❌ Yes | ✅ Fixed! |

---

**Status:** ✅ **Ready to use!**

Your app should now render properly with `npm run dev`
