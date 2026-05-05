// Quality gate for public intake. Determines whether a finished intake should
// notify Brad or sit silently in Supabase. The bar:
//
//  1. Real first name (>= 2 chars, not obviously garbage)
//  2. Validated email (already format-checked + non-disposable at entry)
//  3. Section 1 substantively answered (business_type captured)
//  4. Section 2 substantively answered (>= 50 chars of real content captured under whats_broken_*)
//  5. AI fit_read is strong / possible / unclear (NOT weak / not_a_fit)
//  6. Conclusion reason is not low_engagement, not_legitimate, or no_email
//
// Returns { passed: bool, reasons: string[] } where reasons explains every check
// outcome (pass and fail) so Brad's review surface can show why an intake was
// quarantined.

const GARBAGE_NAME_PATTERNS = [
  /^a+s+d+f*$/i,
  /^q+w+e+r+t*y*$/i,
  /^test\d*$/i,
  /^name$/i,
  /^[\W\d_]+$/,    // pure punctuation/numbers/underscores
];

function isGarbageName(name) {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (trimmed.length < 2) return true;
  if (GARBAGE_NAME_PATTERNS.some((re) => re.test(trimmed))) return true;
  return false;
}

function findAnswerByPrefix(answers, objectivePrefix) {
  if (!answers || typeof answers !== 'object') return null;
  for (const [key, data] of Object.entries(answers)) {
    if (key.startsWith(objectivePrefix + '.') || key === objectivePrefix) {
      const value = typeof data === 'string' ? data : data?.value;
      if (value && typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
  }
  return null;
}

function totalCharsByPrefix(answers, objectivePrefix) {
  if (!answers || typeof answers !== 'object') return 0;
  let total = 0;
  for (const [key, data] of Object.entries(answers)) {
    if (key.startsWith(objectivePrefix + '.') || key === objectivePrefix) {
      const value = typeof data === 'string' ? data : data?.value;
      if (value && typeof value === 'string') total += value.trim().length;
    }
  }
  return total;
}

const FAILING_FIT_READS = new Set(['weak', 'not_a_fit']);
const SILENT_DROP_REASONS = new Set(['not_legitimate', 'low_engagement', 'no_email']);

/**
 * Run the full quality gate on a completed intake row.
 * @param {object} row - public_intake_responses row (post-conclusion).
 * @returns {{ passed: boolean, reasons: string[] }}
 */
export function evaluateQuality(row) {
  const reasons = [];
  let passed = true;

  // 1. Conclusion reason filter — silent drops never notify
  if (SILENT_DROP_REASONS.has(row.conclusion_reason)) {
    reasons.push(`drop:conclusion_reason=${row.conclusion_reason}`);
    return { passed: false, reasons };
  }

  // 2. Name
  if (isGarbageName(row.visitor_name)) {
    reasons.push('fail:visitor_name_garbage_or_too_short');
    passed = false;
  } else {
    reasons.push('pass:visitor_name');
  }

  // 3. Email — entry-level validation already happened. Re-check it's still there.
  if (!row.visitor_email || !row.visitor_email_normalized) {
    reasons.push('fail:visitor_email_missing');
    passed = false;
  } else {
    reasons.push('pass:visitor_email');
  }

  // 4. Section 1 — business type captured
  const businessType = findAnswerByPrefix(row.answers, 'who_business_type')
    || findAnswerByPrefix(row.answers, 'who.business_type')
    || findAnswerByPrefix(row.answers, 'who');
  if (!businessType || businessType.length < 3) {
    reasons.push('fail:no_business_type_captured');
    passed = false;
  } else {
    reasons.push('pass:business_type_captured');
  }

  // 5. Section 2 — what's broken, >= 50 chars
  const brokenChars = totalCharsByPrefix(row.answers, 'whats_broken')
    + totalCharsByPrefix(row.answers, 'pain');
  if (brokenChars < 50) {
    reasons.push(`fail:whats_broken_too_thin(${brokenChars}_chars)`);
    passed = false;
  } else {
    reasons.push(`pass:whats_broken(${brokenChars}_chars)`);
  }

  // 6. fit_read
  if (!row.fit_read || FAILING_FIT_READS.has(row.fit_read)) {
    reasons.push(`fail:fit_read=${row.fit_read || 'unset'}`);
    passed = false;
  } else {
    reasons.push(`pass:fit_read=${row.fit_read}`);
  }

  return { passed, reasons };
}
