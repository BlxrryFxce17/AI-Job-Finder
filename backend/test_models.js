require('dotenv').config();
const { Groq } = require('groq-sdk');
const groq = new Groq();
async function test() {
  const list = await groq.models.list();
  console.log(list.data.map(m => m.id));
}
test();
