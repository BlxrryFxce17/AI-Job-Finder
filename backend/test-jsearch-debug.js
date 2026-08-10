const axios = require('axios');
require('dotenv').config();

const test = async () => {
  try {
    const res = await axios.get('https://jsearch.p.rapidapi.com/search-v2', {
      params: {
        query: 'Full Stack Developer',
        country: 'in',
        date_posted: 'all',
        num_pages: '1'
      },
      headers: {
        'x-rapidapi-host': 'jsearch.p.rapidapi.com',
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      }
    });
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error(err.response ? err.response.data : err.message);
  }
};
test();
