// The exact consent wording shown next to the footer signup checkboxes.
// The build renders these strings into the page and the signup function stores the same strings
// with each consent, so the database always records exactly what the guest saw.
// If you change the wording, change it only here (code and stored text stay in step).

export const EMAIL_CONSENT_TEXT =
  'Email me deals and open dates from 12 Point Getaways, a couple of emails a month. Unsubscribe anytime.';

export const SMS_CONSENT_TEXT =
  'Text me too. I agree to get recurring marketing texts from 12 Point Getaways about deals and open dates ' +
  'at the mobile number above. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. ' +
  'Consent is not a condition of booking.';

// Plain messages the form shows (JS) or the fallback page shows (no JS).
export const MESSAGES = {
  ok: "You're on the list. Watch for deals and open dates soon.",
  disabled: "Signups aren't available right now. Please try again later.",
  rateLimited: 'Too many tries. Please wait a minute and try again.',
  error: 'Something went wrong on our end. Please try again later.',
  badEmail: 'Please enter a valid email address.',
  badPhone: 'Please enter a 10-digit US mobile number, or leave it blank.',
  needPhone: 'Add your mobile number to get texts, or untick the text box.',
  needConsent: 'Tick at least one box so we know how to reach you.',
  tooLarge: 'That request was too large.',
  method: 'Signups only accept form posts.',
};
