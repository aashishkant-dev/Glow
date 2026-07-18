and # Customer-side UX requirements (from annotated production screenshots, 2026-05-19)

Source: hand-annotated screenshots of **production** (glow.vercel.app) in
`screenshot/WhatsApp Image 2026-05-19 at 1.08.0*`. These are the user's intended
changes. Production is the visual/flow reference.

## 1. Home screen
- **Reorder:** "Your Bookings" should be HIGHER (up); the "Why Glow / Trust"
  section (Police Checked, ID Verified, 4.8 Rating, Certified Providers) should move
  DOWN — or be **removed entirely** (user: "we don't need 'Why Glow' on home
  page, we have the on-demand button").
- **Consolidate booking modes:** the 3 cards (On Demand / Scheduled / Home Care)
  all open the same tab. User: "do we really need that many? Make a big reddish
  button for On Demand and Schedule, and the rest of the screen should be the map."
  → One prominent On-Demand CTA (+ Schedule), map fills the rest.

## 2. Booking flow — On Demand vs Scheduled
- **On Demand** = instant. Skip the Date & Time step AND the Choose-Provider step →
  go **straight to booking confirmation with the nearest available Provider**. OR show
  Providers as options ordered by **ETA to client, ascending**. (User: "On demand should
  be straight up booking window like bathing, personal care.")
- **Scheduled** = the multi-step flow (date/time → choose Provider) is fine here.
- The Date & Time calendar only belongs to **Scheduled** (it currently appears for
  on-demand too).

## 3. Choose-Provider screen (Scheduled)
- "Not very pleasant looking." Polish it.
- In **Scheduled**: open the "Browse Profiles" tab. In **On Demand**: "Near Me".
- Provider selection list should **scroll vertically, not slide** (horizontal carousel
  feels wrong).

## 4. Address
- The booking address should be the **client's home address**, not a generic
  "Greater Sudbury, ON".
- **Prompt for the address during booking, right after service selection.**

## 5. Tracking / booking-detail page (redesign)
- Make the **map full-screen** as the base layer.
- **Scroll up** → reveal the Provider profile + short rating/details.
- **Scroll more** → reveal full booking details (date, time, duration, address, payment).
- The "Your Caregiver" card must be **tappable → open Provider details + their service /
  review history** (currently the `›` does nothing useful).

## 6. Theme
- Replace remaining **black buttons/heros** ("Book This Again", tracking hero, booking
  hero) with the brand **green**. (Production still shows black; dev should be green.)

## 7. FAB / nav
- Production FAB is a blue `+`. On dev it was changed to green search — confirm the
  intended customer FAB (likely a prominent "book" action, green).

---

## Priority (proposed — confirm with user)
1. **Theme**: black→green heros/buttons (quick, visible). 
2. **Home reorder/remove trust** (quick).
3. **Address prompt after service select** (medium — booking flow + backend field).
4. **On-Demand skips date/Provider → nearest Provider** (large — flow logic + ETA sort).
5. **Tracking full-screen-map redesign + caregiver detail/history** (large — new screen layout + Provider history view).
6. **Choose-Provider polish + vertical scroll** (medium).

Each large item should be designed before implementation.
