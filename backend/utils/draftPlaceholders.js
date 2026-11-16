// Match template fields as complete labels. In particular, LinkedIn is not Link.
function unresolvedPlaceholders(text) {
  const pattern = /\[(?:(?:your|insert)\b[^\]]*|(?:phone(?: number)?|(?:full |first |last )?name|link(?: to [^\]]+)?|company(?: name)?|experience|email(?: address)?|job title|role|location|portfolio url))\]/gi;
  return [...String(text || '').matchAll(pattern)].filter(match => {
    // Named navigation/project links are content, not empty template fields.
    if (/^\[(?:your|insert)\b/i.test(match[0])) return true;
    return !/^\(\s*https?:\/\/[^\s)]+\)/i.test(String(text).slice(match.index + match[0].length));
  }).map(match => match[0]);
}
module.exports = { unresolvedPlaceholders };
