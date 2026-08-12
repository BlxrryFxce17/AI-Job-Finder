const axios = require('axios');
const Job = require('../models/Job');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Fetch jobs from Adzuna API and save to database
 */
async function fetchAndSaveJobs(userId, queries) {
  if (!config.adzunaAppId || !config.adzunaAppKey) {
    throw new Error('ADZUNA_APP_ID or ADZUNA_APP_KEY is not set');
  }
  
  if (!Array.isArray(queries) || queries.length === 0) {
    queries = ['junior software developer, fresher software engineer, entry level developer'];
  }
  
  let totalAdded = 0;
  
  for (const what of queries) {
    // Random page for variety
    const page = Math.floor(Math.random() * 5) + 1;
    const url = `https://api.adzuna.com/v1/api/jobs/in/search/${page}?app_id=${config.adzunaAppId}&app_key=${config.adzunaAppKey}&what=${encodeURIComponent(what)}&results_per_page=20&max_days_old=30&sort_by=date`;
    
    try {
      logger.info('[Adzuna] Fetching jobs', { query: what, page });
      const response = await axios.get(url);
      const apiJobs = response.data?.results || [];
      
      for (const job of apiJobs) {
        const company = job.company?.display_name || 'Unknown';
        const role = job.title || 'Unknown Role';
        const jd = job.description || 'No description available';
        
        // Avoid duplicates
        const exists = await Job.findOne({ company, role, userId });
        if (!exists) {
          const newJob = new Job({
            userId,
            id: job.id || Date.now().toString() + Math.random(),
            company,
            role,
            jd,
            status: 'Found',
            publishedAt: job.created ? new Date(job.created) : new Date(),
            applyLink: job.redirect_url || '',
            location: job.location?.display_name || 'India',
          });
          await newJob.save();
          totalAdded++;
        }
      }
    } catch (err) {
      logger.error(`[Adzuna] Error fetching for query "${what}"`, { error: err.message });
    }
  }
  
  logger.info('[Adzuna] Fetch complete', { totalAdded, queriesCount: queries.length });
  return totalAdded;
}

module.exports = {
  fetchAndSaveJobs
};