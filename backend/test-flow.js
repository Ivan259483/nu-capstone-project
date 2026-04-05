import axios from 'axios';
import jwt from 'jsonwebtoken';
import { config } from './config/environment.js';

const token = jwt.sign({ id: '65f123456789012345678901', role: 'administrator' }, config.jwtSecret, { expiresIn: '1h' });
const api = axios.create({
  baseURL: 'http://localhost:3001/api',
  headers: { Authorization: `Bearer ${token}` }
});

async function run() {
  const get1 = await api.get('/products');
  const p1 = get1.data.data[0];
  console.log("Before update:", p1.name, p1.inventory);
  
  const updateRes = await api.put(`/products/${p1._id}`, { inventory: p1.inventory + 1 });
  console.log("Update Success:", updateRes.data.success);
  
  const get2 = await api.get('/products');
  const p2 = get2.data.data.find(x => x._id === p1._id);
  console.log("After update:", p2.name, p2.inventory);
}
run().catch(console.error);
