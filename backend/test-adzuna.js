const axios = require('axios');
require('dotenv').config();

const test = async () => {
  try {
    const res = await axios.get('https://api.adzuna.com/v1/api/jobs/in/search/1', {
      params: {
        app_id: process.env.ADZUNA_APP_ID,
        app_key: process.env.ADZUNA_APP_KEY,
        what: 'software developer',
        results_per_page: 5
      },
      headers: { 'Accept': 'application/json' }
    });
    console.log('Total results:', res.data.count);
    console.log('First job:', JSON.stringify(res.data.results?.[0], null, 2));
  } catch (err) {
    console.error('Status:', err.response?.status);
    console.error('Error:', err.response?.data || err.message);
  }
};
test();
