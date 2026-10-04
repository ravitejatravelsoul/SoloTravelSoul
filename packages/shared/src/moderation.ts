// Moderation policy shared by the app, the Firestore rules and the tests.
//
// BLOCKED_TERMS is enforced server-side by firestore.rules (function clean())
// on public text: posts, journals, comments, public profiles, community groups
// and public trips. The rules embed BLOCKED_TERMS_RULES_PATTERN verbatim; a
// release test fails if the two drift apart. Keep the list to unambiguous
// slurs, sexual and self-harm terms — words with common innocent uses (e.g.
// "nude beach") create false positives and are left to reporting/moderation.

export const BLOCKED_TERMS: readonly string[] = [
  'fuck\\w*',
  'motherfuck\\w*',
  'cunts?',
  'pussy',
  'porn\\w*',
  'blowjobs?',
  'handjobs?',
  'rap(e|ist|ists)',
  'p(a)?edophil\\w*',
  'nigg(er|ers|a|as)',
  'faggots?',
  'fags',
  'retards?',
  'kikes?',
  'trann(y|ies)',
  'whores?',
  'sluts?',
  'kill yourself',
  'kys',
];

/** RE2 pattern (used by Firestore rules `string.matches`, which must match the whole string). */
export const BLOCKED_TERMS_RULES_PATTERN = `(?is).*\\b(${BLOCKED_TERMS.join('|')})\\b.*`;

const BLOCKED_TERMS_REGEX = new RegExp(`\\b(${BLOCKED_TERMS.join('|')})\\b`, 'i');

/** True when public text would be rejected by the rules' content filter. */
export function containsBlockedTerm(text: string | null | undefined): boolean {
  return typeof text === 'string' && BLOCKED_TERMS_REGEX.test(text);
}

/** Distinct reports after which a public post/journal is hidden pending review. */
export const REPORT_HIDE_THRESHOLD = 3;

/** Visibility values set by moderation; authors cannot change them back. */
export const MODERATED_VISIBILITY = ['under_review', 'removed'] as const;
