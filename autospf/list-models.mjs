import { GoogleGenerativeAI } from '@google/generative-ai';
const genAI = new GoogleGenerativeAI('AIzaSyB5NtRcu4bOAJ2YTpQotCKcymQ5lGHgxts');
async function run() {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyB5NtRcu4bOAJ2YTpQotCKcymQ5lGHgxts`);
    const data = await response.json();
    console.log(data.models.map(m => m.name).filter(n => n.includes('flash') || n.includes('vision')));
  } catch(e) { console.error(e) }
}
run();
