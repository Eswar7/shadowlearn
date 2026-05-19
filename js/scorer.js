/**
 * ShadowLearn — Word-Level Scorer
 * Compares spoken text against expected words using exact + fuzzy matching.
 */

const Scorer = (() => {

  /**
   * Calculate Levenshtein distance between two strings
   */
  function levenshteinDistance(a, b) {
    const matrix = [];
    const aLen = a.length;
    const bLen = b.length;

    if (aLen === 0) return bLen;
    if (bLen === 0) return aLen;

    for (let i = 0; i <= bLen; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= aLen; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= bLen; i++) {
      for (let j = 1; j <= aLen; j++) {
        const cost = b[i - 1] === a[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[bLen][aLen];
  }

  /**
   * Calculate similarity ratio between two strings (0 to 1)
   */
  function similarity(a, b) {
    if (a === b) return 1;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - levenshteinDistance(a, b) / maxLen;
  }

  /**
   * Normalize a string for comparison: lowercase, strip punctuation, trim
   */
  function normalize(text) {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')   // remove punctuation (Unicode-aware)
      .replace(/\s+/g, ' ')               // normalize whitespace
      .trim();
  }

  /**
   * Tokenize a string into words
   */
  function tokenize(text) {
    const normalized = normalize(text);
    return normalized ? normalized.split(' ') : [];
  }

  /**
   * Find the best matching spoken word for an expected word
   */
  function findBestMatch(expectedWord, spokenWords) {
    let bestScore = 0;
    let bestWord = null;

    for (const spoken of spokenWords) {
      const score = similarity(expectedWord, spoken);
      if (score > bestScore) {
        bestScore = score;
        bestWord = spoken;
      }
    }

    return { word: bestWord, score: bestScore };
  }

  /**
   * Score spoken text against expected words
   * 
   * @param {string} spokenText - What the learner said (recognized text)
   * @param {string[]} expectedWords - Array of expected words to match against (e.g., Kannada script)
   * @param {string[]} [displayWords] - Optional display labels (e.g., transliterations) for the UI
   * @returns {Object} Score result with overall percentage and per-word breakdown
   */
  function score(spokenText, expectedWords, displayWords) {
    const spokenWords = tokenize(spokenText);
    const results = [];
    let totalScore = 0;

    // Thresholds
    const EXACT_MATCH_THRESHOLD = 0.95;  // >= 95% = exact match
    const CLOSE_MATCH_THRESHOLD = 0.60;  // >= 60% = close match

    for (let i = 0; i < expectedWords.length; i++) {
      const expected = expectedWords[i];
      const displayLabel = (displayWords && displayWords[i]) || expected;
      const normalizedExpected = normalize(expected);
      const match = findBestMatch(normalizedExpected, spokenWords);

      let status, wordScore;

      if (match.score >= EXACT_MATCH_THRESHOLD) {
        status = 'matched';
        wordScore = 1.0;
      } else if (match.score >= CLOSE_MATCH_THRESHOLD) {
        status = 'close';
        wordScore = 0.5; // partial credit
      } else {
        status = 'missed';
        wordScore = 0;
      }

      totalScore += wordScore;
      results.push({
        expected: displayLabel,
        spoken: match.word || '—',
        similarity: match.score,
        status: status,
        wordScore: wordScore
      });
    }

    const overallScore = expectedWords.length > 0
      ? Math.round((totalScore / expectedWords.length) * 100)
      : 0;

    // Determine feedback message
    let message;
    if (overallScore >= 90) message = '🎉 Excellent!';
    else if (overallScore >= 70) message = '👍 Great job!';
    else if (overallScore >= 50) message = '💪 Getting there!';
    else if (overallScore >= 30) message = '🔄 Keep practicing!';
    else message = '🎯 Try again!';

    return {
      overallScore,
      message,
      spokenText: spokenText || '(no speech detected)',
      spokenWords,
      wordResults: results
    };
  }

  // Public API
  return {
    score,
    normalize,
    tokenize,
    similarity,
    levenshteinDistance
  };

})();
