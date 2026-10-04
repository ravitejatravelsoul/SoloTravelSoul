// GET /account-deletion — the web resource Google Play requires for account
// deletion requests from people who no longer have the app installed.

const CONTACT = 'privacy@solotravelsoul.app';

export function accountDeletionPage(): Response {
  const subject = encodeURIComponent('Delete my SoloTravelSoul account');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Delete your SoloTravelSoul account</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px 16px; line-height: 1.55; color: #1b2430; background: #fff; }
  h1 { font-size: 1.5rem; } h2 { font-size: 1.1rem; margin-top: 1.6em; }
  a.button { display: inline-block; background: #1270C2; color: #fff; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-weight: 600; }
</style>
</head>
<body>
<h1>Delete your SoloTravelSoul account</h1>
<p>You can delete your SoloTravelSoul account and its data at any time, with or without the app.</p>

<h2>In the app</h2>
<p>Open <strong>Profile</strong> → <strong>Delete account</strong> and confirm your password. Deletion starts immediately.</p>

<h2>Without the app</h2>
<p>Email us from the address you use to sign in to SoloTravelSoul. We reply to that address to confirm the request before deleting anything, then confirm by email when deletion is complete.</p>
<p><a class="button" href="mailto:${CONTACT}?subject=${subject}">Request account deletion</a></p>
<p>Or write to <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>

<h2>What is deleted</h2>
<p>Your profile, trips, itineraries, checklists, journal entries, saved places, public profile and traveler discovery data, travel posts and journals, likes, saves, follows, notifications, place reviews, activity feed items, join requests, community trips and groups you created, and photos you uploaded.</p>

<h2>What is kept</h2>
<p>Messages you sent in group or direct chats stay visible to the other participants, labelled "Deleted User". Comments you left on other travelers' posts become empty "Deleted User" placeholders so replies stay readable. Safety reports you submitted are kept for moderation.</p>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
