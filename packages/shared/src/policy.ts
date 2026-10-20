// One place for the user-facing safety and policy wording, so the Terms, the Safety screen, the join
// request screens and the sign-up agreement say the same thing (a release test compares them).
// NOT legal advice: the owner and a qualified lawyer must review all of it before launch.

/** What other people see in place of a deleted account's name (the deletion service writes the same text). */
export const DELETED_ACCOUNT_NAME = 'Deleted User';

/** Bump when the Terms, Privacy Policy or community rules change in a way users must re-accept. */
export const TERMS_VERSION = '2026-10-19';

/** What compatibility is and is not. */
export const COMPATIBILITY_NOTICE =
  'Compatibility is based only on answers travelers chose to share. It is not identity verification and not a safety guarantee. Organizers decide who joins; you decide whether to go.';

/** What the platform does and does not do (no claim of checks, insurance or monitored help). */
export const PLATFORM_ROLE =
  'SoloTravelSoul is a place to find and plan trips with other travelers. We do not run the trips, we do not verify identities or run background checks, and we do not provide insurance, travel services or emergency assistance. Travelers and organizers are responsible for their own plans, bookings and conduct.';

export const NOT_EMERGENCY_SERVICE =
  'SoloTravelSoul is not an emergency service and is not monitored around the clock. In an emergency, contact your local emergency number.';

export const SAFETY_TIPS: readonly { title: string; body: string }[] = [
  { title: 'Meet in public first', body: 'Meet new people in a public place before agreeing to travel together, and consider a video call first.' },
  { title: 'Talk it through', body: 'Agree plans, budget, who pays for what, and boundaries before you commit. Trust your instincts, and say no or leave if something feels wrong.' },
  { title: 'Tell someone you trust', body: 'Share your plans, the people you are meeting and your itinerary with a friend or family member.' },
  { title: 'Protect money and documents', body: 'Do not send money to someone you have not met, and do not share passports, ID numbers, card details or other sensitive documents in chat.' },
];

/** Short reminder shown right where someone asks to join a trip. */
export const JOIN_SAFETY_REMINDER =
  'Meet in public first, agree plans and budget before you commit, tell someone you trust your plans, and never send money to someone you have not met.';

export const REPORT_BLOCK_LEAVE =
  'You can report or block a person from their profile or chat, report a trip from its page, and leave a group chat or trip you joined. Blocking is private.';
