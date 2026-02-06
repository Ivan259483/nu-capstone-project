#!/bin/bash
# Email Setup Commands Quick Reference

# ============================================
# INSTALLATION
# ============================================

# 1. Install nodemailer (required for all email providers)
cd /Users/ivan/Desktop/AutoSPF+/backend
npm install nodemailer

# 2. Copy .env template
cp .env.example .env

# 3. Edit .env with your credentials
nano .env
# or
vim .env
# or open in VS Code

# ============================================
# QUICK PROVIDER SETUP
# ============================================

# === OPTION 1: Development (Instant) ===
# EMAIL_PROVIDER=console
npm run dev
# Emails will be logged to console

# === OPTION 2: Testing with Gmail (10 min) ===
# 1. Get app password: https://myaccount.google.com/apppasswords
# 2. Update .env:
#    EMAIL_PROVIDER=gmail
#    EMAIL_USER=your@gmail.com
#    EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
npm run dev

# === OPTION 3: Production with Brevo (5 min) ✅ RECOMMENDED ===
# 1. Sign up: https://www.brevo.com
# 2. Get SMTP credentials: app.brevo.com → Settings → SMTP & API
# 3. Update .env:
#    EMAIL_PROVIDER=brevo
#    BREVO_SMTP_USER=contact@autospf.com
#    BREVO_SMTP_PASSWORD=your_brevo_password
npm run dev

# ============================================
# SERVER MANAGEMENT
# ============================================

# Start development server
npm run dev

# Stop server (press Ctrl+C)

# View logs
npm run dev 2>&1 | tee logs.txt

# ============================================
# TESTING EMAIL ENDPOINTS
# ============================================

# 1. Send OTP Email
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Expected Response:
# {
#   "success": true,
#   "message": "OTP sent successfully",
#   "data": {"email":"test@example.com","expiresIn":600}
# }

# 2. Verify OTP (use code from email)
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","otp":"123456"}'

# Expected Response:
# {
#   "success": true,
#   "message": "OTP verified successfully",
#   "data": {"email":"test@example.com","verified":true}
# }

# 3. Register User (after OTP verified)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name":"John Doe",
    "email":"test@example.com",
    "password":"secure123",
    "role":"customer"
  }'

# Expected Response:
# {
#   "success": true,
#   "message": "User registered successfully",
#   "data": {
#     "user": {...},
#     "token": "eyJhbGc..."
#   }
# }

# 4. Login (optional - after registration)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email":"test@example.com",
    "password":"secure123"
  }'

# ============================================
# BATCH TESTING
# ============================================

# Test multiple emails
for email in test1@example.com test2@example.com test3@example.com; do
  echo "Testing: $email"
  curl -X POST http://localhost:3000/api/auth/send-otp \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\"}"
  sleep 2
done

# ============================================
# PROVIDER-SPECIFIC COMMANDS
# ============================================

# === BREVO ===
# View Brevo Dashboard: https://app.brevo.com
# Test SMTP connection:
telnet smtp-relay.brevo.com 587

# === GMAIL ===
# View Gmail Security: https://myaccount.google.com/security
# Check App Passwords: https://myaccount.google.com/apppasswords
# View Email Activity: https://myaccount.google.com/device-activity

# === Generic SMTP ===
# Test any SMTP server:
telnet smtp.example.com 587

# ============================================
# TROUBLESHOOTING COMMANDS
# ============================================

# Check if server is running
curl http://localhost:3000

# View environment variables
cat .env

# Check MongoDB connection
# If MONGODB_URI=mongodb://localhost:27017/autospf
# Make sure MongoDB is running

# View last N lines of logs
npm run dev 2>&1 | tail -20

# Clear all terminal output
clear

# Kill server process (if stuck)
pkill -f "node"
pkill -f "npm"

# ============================================
# CONFIGURATION COMMANDS
# ============================================

# Copy template .env
cp .env.example .env

# Copy detailed template
cp .env.local .env

# Show current provider
grep EMAIL_PROVIDER .env

# Show all email config
grep -E "^EMAIL|^BREVO|^SMTP|^OTP" .env

# Switch provider (example: to Brevo)
sed -i '' 's/EMAIL_PROVIDER=.*/EMAIL_PROVIDER=brevo/' .env

# Switch provider (example: to Gmail)
sed -i '' 's/EMAIL_PROVIDER=.*/EMAIL_PROVIDER=gmail/' .env

# Switch provider (example: to console)
sed -i '' 's/EMAIL_PROVIDER=.*/EMAIL_PROVIDER=console/' .env

# ============================================
# DOCUMENTATION
# ============================================

# View Brevo setup guide
cat BREVO_SETUP_GUIDE.md

# View quick reference
cat EMAIL_QUICK_REFERENCE.md

# View setup flowchart
cat EMAIL_SETUP_FLOWCHART.md

# View provider switching guide
cat EMAIL_PROVIDER_SWITCHING.md

# View getting started guide
cat GETTING_STARTED_EMAIL.md

# ============================================
# USING POSTMAN (ALTERNATIVE TO CURL)
# ============================================

# 1. Open Postman
# 2. Create new request
# 3. Method: POST
# 4. URL: http://localhost:3000/api/auth/send-otp
# 5. Headers:
#    Content-Type: application/json
# 6. Body (raw JSON):
#    {"email":"test@example.com"}
# 7. Click Send

# ============================================
# USEFUL ALIASES (Add to ~/.zshrc or ~/.bashrc)
# ============================================

# Quick start
alias email-dev='cd backend && npm run dev'

# Test OTP
alias email-test='curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@example.com\"}"'

# View config
alias email-config='cat .env | grep -E "^EMAIL|^BREVO|^SMTP|^OTP"'

# View logs
alias email-logs='npm run dev 2>&1 | tee logs.txt'

# ============================================
# MONITORING
# ============================================

# Monitor in real-time
npm run dev

# Check email queue (if implemented)
# curl http://localhost:3000/api/admin/emails

# View delivery status (provider-specific)
# Brevo: https://app.brevo.com/emails
# Gmail: https://mail.google.com/mail/#sent

# ============================================
# SUMMARY
# ============================================

# Quick Start:
# 1. npm install nodemailer
# 2. cp .env.example .env
# 3. Edit .env with your credentials
# 4. npm run dev
# 5. curl -X POST http://localhost:3000/api/auth/send-otp \
#      -H "Content-Type: application/json" \
#      -d '{"email":"test@example.com"}'

# That's it! 🚀
