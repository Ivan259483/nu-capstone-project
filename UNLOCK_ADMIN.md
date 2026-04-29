# 🔓 Unlock Admin Account

## Instant Fix (Copy-paste sa Browser Console)

1. Pumunta sa `http://localhost:5173/login`
2. Pindutin ang **F12** (o Cmd+Option+I) para buksan ang DevTools
3. I-click ang **Console** tab
4. I-paste ang code na ito at pindutin ang Enter:

```javascript
fetch('http://localhost:3000/api/auth/unlock', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({email: 'admin@test.com'})
}).then(r => r.json()).then(d => console.log('✅ RESULT:', JSON.stringify(d, null, 2))).catch(e => console.error('❌ ERROR:', e));
```

5. Dapat makita mo: `✅ RESULT: { "success": true, "message": "Account unlocked successfully for admin@test.com." }`
6. I-refresh ang login page at subukan ulit mag-login!

---

## Kung Ayaw Gumana (Alternative)

Subukan mula sa login page mismo (same origin):

```javascript
fetch('/api/auth/unlock', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({email: 'admin@test.com'})
}).then(r => r.json()).then(console.log)
```
