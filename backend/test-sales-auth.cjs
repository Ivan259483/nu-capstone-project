const jwt = require('jsonwebtoken');
const token = jwt.sign({ id: '69f217c158c8a212730083a9', role: 'sales' }, 'cb47fbd6640182132e1f1bc80147e8de6eb6d129d0759f379e2c01ab42ed5a4be298400fcc3a2c43236d5dce30fcf1ca1b10421df1d7ccf63c263dd91262a1e7');
const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 5000,
  path: '/api/bookings?limit=1000&skip=0',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + token
  }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Status code:', res.statusCode);
      console.log('Orders found:', json.data ? json.data.length : 'none');
      if (json.data && json.data.length > 0) {
        console.log('First order status:', json.data[0].status);
        console.log('First order proof:', json.data[0].paymentProofUrl);
      }
      if (res.statusCode !== 200) {
        console.log('Error:', json);
      }
    } catch(e) { console.log(data); }
  });
});
req.end();
