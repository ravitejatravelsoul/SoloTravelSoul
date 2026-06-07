# Map and Places API — Cost Estimate

All figures are estimates based on public pricing as of May 2026.
Verify current pricing before launch at mapbox.com and foursquare.com.

---

## Mapbox Mobile SDK

**Billing model:** Monthly Active Users (MAU)

| MAU range | Cost |
|---|---|
| 0 – 50,000 MAU/month | **Free** |
| 50,001 – 100,000 | ~$0.05 / MAU above free tier |
| 100,001+ | Custom pricing |

**For a typical beta/v1 launch:**
- Under 10,000 MAU → **$0/month**
- Under 50,000 MAU → **$0/month**

Mapbox counts a MAU as a unique user who opens a screen that loads a MapView in a calendar month.

**Map tile requests** are not separately billed for the mobile SDK — they are bundled into the MAU pricing.

**Optimization tips:**
- Only load MapView when user explicitly taps the Map tab (already implemented — map is not mounted in List view)
- Use `styleURL: mapbox://styles/mapbox/streets-v12` (hosted tile set, no extra charge)

---

## Foursquare Places API

**Billing model:** Per API call (or per MAU on some plans)

| Plan | Calls/day | Monthly cost |
|---|---|---|
| Free / Developer | 1,000 calls/day | $0 |
| Growth | 50,000 calls/day | ~$150/month |
| Enterprise | Custom | Custom |

**Estimate for beta launch (500 daily active users):**

Assumptions:
- 50% of users trigger at least one Foursquare search per day
- Average 3 searches per active user per day
- 50 daily limit per user in app code

Best case: 500 × 0.5 × 3 = **750 calls/day → Free tier**
Worst case: 500 × 50 = 25,000 calls/day → **still free tier**

At **5,000 daily active users**, you may hit the free tier ceiling and need a paid plan.

**EAS Build credits:** The EAS Free plan includes a limited number of builds per month.
- Roughly 30 build credits/month on the free plan.
- Each EAS Build consumes 1 credit (for development/preview) or more (for production).
- If you run many iterations, consider the EAS Production plan ($99/month).

---

## Summary — total cost for beta (< 50k MAU)

| Service | Monthly cost |
|---|---|
| Mapbox Mobile SDK | $0 |
| Foursquare Places (< 1k calls/day) | $0 |
| Firebase (Auth + Firestore + Storage) | $0 (Spark free tier) |
| EAS Build (limited builds) | $0 (free plan) |
| **Total** | **$0/month** |

---

## When costs start

| Trigger | Service | Estimated cost |
|---|---|---|
| > 50k MAU | Mapbox | ~$0.05/MAU above 50k |
| > 1k Foursquare calls/day | Foursquare | ~$150/month for Growth |
| > 5GB Firestore reads | Firebase | ~$0.06/100k reads above free tier |
| > 10 EAS builds/week | EAS | $99/month for Production plan |

---

## Billing safeguards

1. **Mapbox**: No credit card needed for free tier. Set a spend cap in the Mapbox dashboard.
2. **Foursquare**: Monitor daily calls in the developer portal. The app's 50-call/user/day
   limit prevents runaway costs from individual abusers.
3. **Firebase**: Set Firebase budget alerts at $5, $25, $50 in the Firebase console.
4. **EAS**: Track build credit usage at expo.dev/accounts.

---

## To turn off all paid features instantly

```bash
# Disable Mapbox (reverts to NativeMapCanvas preview)
eas env:update --environment production --name EXPO_PUBLIC_MAPBOX_ENABLED --value "false"

# Disable Foursquare (reverts to bundled attractions only)
eas env:update --environment production --name EXPO_PUBLIC_FOURSQUARE_ENABLED --value "false"
```

Both take effect on the **next app cold start** — no new build required, because these
are `EXPO_PUBLIC_` vars embedded at bundle time.

Wait — correction: `EXPO_PUBLIC_` vars are baked into the JS bundle at EAS build time.
Changing them in EAS env does NOT affect already-distributed builds.
To change these values, you must **trigger a new EAS build and submit it**.

For instant kill-switch without a new build, consider moving the flag to a Firestore
remote config document that the app reads on startup.
