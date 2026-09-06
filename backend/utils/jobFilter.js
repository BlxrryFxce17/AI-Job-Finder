// backend/utils/jobFilter.js

// Senior / Lead role keywords (title-level match)
const SENIOR_TITLE_REGEX = /\b(sr\.?|senior|lead|principal|staff|architect|director|vp|vice president|manager|head of|sde[- ]?(3|iii)|engineer[- ]?(3|iii)|level[- ]?3)\b/i;

// Experience requirement regex for 5+ years (JD / description level match)
const SENIOR_EXP_REGEX = /(?:5\+|[5-9]|\d{2})\+?\s*(?:-\s*\d+\s*)?(?:years?|yrs?)(?:\s+of)?\s+experience|minimum\s+(?:of\s+)?(?:5|[6-9]|\d{2})\+?\s*(?:years?|yrs?)/i;

// Junior / Entry role keywords (title-level match)
const JUNIOR_TITLE_REGEX = /\b(jr\.?|junior|entry|entry[- ]level|fresher|freshers|intern|internship|associate|trainee|graduate|grad|sde[- ]?(1|i)\b|engineer[- ]?(1|i)\b|level[- ]?1)\b/i;

// Junior experience regex (0-2 years, freshers, no experience)
const JUNIOR_EXP_REGEX = /(?:0[- ](?:to[- ])?[1-2]|0\+?|[1-2])\s*(?:years?|yrs?)(?:\s+of)?\s+experience|\b(freshers?|no experience|entry[- ]level|recent graduates?)\b/i;

/**
 * Checks if a job title or description indicates a senior / lead position.
 * @param {string} role - Job title
 * @param {string} jd - Job description
 * @returns {boolean}
 */
function isSeniorRole(role = '', jd = '') {
    if (SENIOR_TITLE_REGEX.test(role)) return true;
    if (SENIOR_EXP_REGEX.test(jd)) return true;
    return false;
}

/**
 * Checks if a job title or description indicates a junior / entry position.
 * @param {string} role - Job title
 * @param {string} jd - Job description
 * @returns {boolean}
 */
function isJuniorRole(role = '', jd = '') {
    // If title explicitly has senior keywords, it's NOT junior even if JD mentions "junior team members"
    if (SENIOR_TITLE_REGEX.test(role)) return false;
    if (JUNIOR_TITLE_REGEX.test(role)) return true;
    if (JUNIOR_EXP_REGEX.test(jd) && !SENIOR_EXP_REGEX.test(jd)) return true;
    return false;
}

/**
 * Classifies experience level into 'Junior', 'Senior', or 'Mid'.
 * @param {string} role - Job title
 * @param {string} jd - Job description
 * @returns {'Junior' | 'Senior' | 'Mid'}
 */
function detectExperienceLevel(role = '', jd = '') {
    if (isSeniorRole(role, jd)) return 'Senior';
    if (isJuniorRole(role, jd)) return 'Junior';
    return 'Mid';
}

/**
 * Determines whether senior roles should be filtered out based on query string or user profile level.
 * @param {string} query - Search term (e.g., "Junior React Developer")
 * @param {string} userLevel - User's profile experienceLevel (e.g., "Junior / Entry Level", "Mid-Level")
 * @returns {boolean}
 */
function shouldExcludeSenior(query = '', userLevel = '') {
    const q = (query || '').toLowerCase();
    const ul = (userLevel || '').toLowerCase();
    const juniorKeywords = ['junior', 'jr', 'entry', 'fresher', 'intern', 'associate', 'trainee', 'graduate'];
    
    const queryIsJunior = juniorKeywords.some(kw => q.includes(kw));
    const profileIsJunior = juniorKeywords.some(kw => ul.includes(kw)) || ul.includes('0-2') || ul.includes('1-2');
    
    return queryIsJunior || profileIsJunior;
}

module.exports = {
    isSeniorRole,
    isJuniorRole,
    detectExperienceLevel,
    shouldExcludeSenior,
    SENIOR_TITLE_REGEX,
    JUNIOR_TITLE_REGEX
};
