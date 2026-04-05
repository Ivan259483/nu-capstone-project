import axios from 'axios';
async function test() {
  try {
    const res = await axios.get('http://localhost:3001/api/products?limit=3');
    console.log("SUCCESS");
    console.dir(res.data.data.map(p => ({ id: p._id, name: p.name, inventory: p.inventory })), { depth: null });
  } catch (error) {
    console.error("FAILED", error.message);
  }
}
test();
