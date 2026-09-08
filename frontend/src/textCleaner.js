/**
 * Utility function to clean email drafts from raw markdown artifacts.
 * Strips raw bolding (**, __), standardizes bullet points, strips rogue asterisks,
 * and fills or removes bracket placeholders like [Your City, Country] or [Link to Portfolio].
 */
export function cleanDraftText(text, profile = {}) {
  if (!text) return '';
  let cleaned = String(text);

  // 1. Remove markdown bold **text** or __text__
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
  cleaned = cleaned.replace(/__(.*?)__/g, '$1');

  // 2. Convert bullet points like '* ', '- ', '+ ' at start of line to standard bullet '• '
  cleaned = cleaned.replace(/^([ \t]*)[*+-][ \t]+/gm, '$1• ');

  // 3. Remove single italic asterisks or underscores around words
  cleaned = cleaned.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1');
  cleaned = cleaned.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1');

  // 4. Strip any rogue double asterisks or stray asterisks
  cleaned = cleaned.replace(/\*\*/g, '');
  cleaned = cleaned.replace(/(^|[^\w])\*(?=[^\w]|$)/g, '$1');

  // 5. Clean up bracket placeholders using profile if provided
  const loc = (profile && profile.location) || 'India';
  const github = (profile && profile.github) || '';
  const linkedin = (profile && profile.linkedin) || '';
  const portfolio = (profile && (profile.portfolio || profile.github || profile.linkedin)) || '';

  cleaned = cleaned.replace(/\[(?:Your\s+)?(?:City|Location)(?:,\s*Country)?\]/gi, loc);
  if (portfolio) {
    cleaned = cleaned.replace(/\[(?:Link\s+to\s+)?Portfolio\]/gi, portfolio);
  } else {
    cleaned = cleaned.replace(/\[(?:Link\s+to\s+)?Portfolio\]/gi, 'available upon request');
  }
  if (github) {
    cleaned = cleaned.replace(/\[(?:Link\s+to\s+)?GitHub\]/gi, github);
  } else {
    cleaned = cleaned.replace(/\[(?:Link\s+to\s+)?GitHub\]/gi, 'available upon request');
  }
  cleaned = cleaned.replace(/\[(?:Your\s+)?Name\]/gi, (profile && profile.name) || 'Akash V');
  cleaned = cleaned.replace(/\[(?:Your\s+)?Phone(?:\s+Number)?\]/gi, (profile && profile.phone) || '');

  return cleaned.trim();
}
