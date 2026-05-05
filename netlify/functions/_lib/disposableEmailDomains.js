// Disposable / temporary email domain blocklist.
// Source: a manually-maintained set drawn from the major tempmail services + the
// commonly-cited disposable-email-domains lists on GitHub. Not exhaustive — new
// services pop up constantly — but blocks the highest-volume offenders.
//
// If a real prospect ever gets caught here, they'll bail and email Brad directly,
// which is fine (we don't want false positives but the cost of one is small).

export const DISPOSABLE_EMAIL_DOMAINS = new Set([
  // 10MinuteMail family
  '10minutemail.com',
  '10minutemail.net',
  '10minutemail.org',
  '20minutemail.com',
  '30minutemail.com',
  // Mailinator family
  'mailinator.com',
  'mailinator.net',
  'mailinator.org',
  'mailinator2.com',
  'binkmail.com',
  'safetymail.info',
  'sogetthis.com',
  'spamherelots.com',
  'streetwisemail.com',
  'thisisnotmyrealemail.com',
  'tradermail.info',
  'veryrealemail.com',
  // GuerrillaMail family
  'guerrillamail.com',
  'guerrillamail.biz',
  'guerrillamail.de',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'sharklasers.com',
  'grr.la',
  'spam4.me',
  // TempMail / Temp-Mail / Temp variants
  'temp-mail.org',
  'temp-mail.io',
  'tempmail.com',
  'tempmail.email',
  'tempmail.net',
  'tempmailaddress.com',
  'tempmail.dev',
  'tempmailo.com',
  'tempr.email',
  'tempinbox.com',
  // YOPmail family
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'cool.fr.nf',
  'jetable.fr.nf',
  'nospam.ze.tc',
  'nomail.xl.cx',
  'mega.zik.dj',
  'speed.1s.fr',
  // Misc high-volume disposables
  'fakeinbox.com',
  'fakemailgenerator.com',
  'getairmail.com',
  'getnada.com',
  'inboxbear.com',
  'inboxkitten.com',
  'mintemail.com',
  'mohmal.com',
  'mytrashmail.com',
  'trashmail.com',
  'trashmail.de',
  'trashmail.net',
  'trbvm.com',
  'throwawaymail.com',
  'throwam.com',
  'discard.email',
  'dispostable.com',
  'maildrop.cc',
  'mailnesia.com',
  'moakt.com',
  'spambox.us',
  'spambog.com',
  'spamgourmet.com',
  'tempinbox.co.uk',
  'wegwerfmail.de',
  'wegwerfemail.de',
  // Newer entrants
  'emailondeck.com',
  'emaildrop.io',
  'fakemail.net',
  'tmail.ws',
  'tmpmail.org',
  'tmpmail.net',
  'tmpbox.net',
  'tmpeml.info',
  'minutemail.com',
  'mailcatch.com',
  'mailnull.com',
  'mvrht.net',
  'spamavert.com',
  'spamfree24.org',
  'spamspot.com',
  'mt2014.com',
  'mt2015.com',
  'mailforspam.com',
  'meltmail.com',
  'mailexpire.com',
  'mailhazard.com',
  'mailhz.me',
  'mailimate.com',
  'mailme.lv',
  'mailmoat.com',
  'mailshell.com',
  'mailtemp.info',
  'oneoffemail.com',
  'tempemail.net',
  'tempemail.com',
  'tempemail.co',
  'tempemail.biz',
  'mail-temporaire.fr',
]);

/**
 * Return the lowercased domain part of an email, or null if the email is malformed.
 */
export function emailDomain(email) {
  if (!email || typeof email !== 'string') return null;
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

/**
 * True if the email's domain is on the disposable blocklist.
 */
export function isDisposableEmail(email) {
  const domain = emailDomain(email);
  if (!domain) return false;
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

/**
 * Basic format validation — not RFC 5322 perfect, but blocks obvious garbage.
 * Real validation is the magic-link round trip; this is just a cheap pre-check.
 */
export function isValidEmailFormat(email) {
  if (!email || typeof email !== 'string') return false;
  if (email.length > 254) return false;
  // Must have exactly one @, non-empty local + domain, domain has at least one dot,
  // no spaces, no consecutive dots in the domain.
  const re = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
  return re.test(email);
}
