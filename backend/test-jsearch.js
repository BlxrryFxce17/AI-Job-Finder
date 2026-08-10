const axios = require('axios');
const test = async () => {
  try {
    const res = await axios.get('https://jsearch.p.rapidapi.com/search', {
      params: { query: 'developer' },
      headers: {
        'x-rapidapi-host': 'jsearch.p.rapidapi.com',
        'x-rapidapi-key': 'a6d0d3e56fmshba6d2f01fdfa816p15779djsn3a1bdff0e2fc'
      }
    });
    console.log(res.data);
  } catch (err) {
    console.error(err.response ? err.response.data : err.message);
  }
};
test();
