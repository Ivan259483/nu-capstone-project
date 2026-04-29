const http = require('http');

const payload = JSON.stringify({ email: 'officeadmin@test.com', password: 'password123' });

const req1 = http.request({
  hostname: '127.0.0.1',
  port: 5000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const response = JSON.parse(data);
    const token = response.token;
    console.log('Got token:', token ? 'yes' : 'no');
    
    if (token) {
      http.get('http://127.0.0.1:5000/api/bookings', {
        headers: { 'Authorization': `Bearer ${token}` }
      }, (res2) => {
        let data2 = '';
        res2.on('data', chunk => data2 += chunk);
        res2.on('end', () => {
          const body = JSON.parse(data2);
          const pending = body.data.filter(b => b.status === 'pending_confirmation');
          console.log(`Found ${pending.length} pending bookings via API`);
          for (const b of pending) {
            console.log(`Booking ${b._id || b.id}:`);
            console.log(`  paymentProofUrl exists: ${!!b.paymentProofUrl}`);
            console.log(`  paymentProofUrl length: ${b.paymentProofUrl ? b.paymentProofUrl.length : 0}`);
            console.log(`  downpaymentProof exists: ${!!b.downpaymentProof}`);
            console.log(`  downpaymentProof length: ${b.downpaymentProof ? b.downpaymentProof.length : 0}`);
          }
        });
      });
    }
  });
});
req1.write(payload);
req1.end();
