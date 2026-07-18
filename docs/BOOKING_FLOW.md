# Glow — Booking Flow & Organization

This is the canonical description of how a booking moves through the system, who
can do what at each step, how money (escrow) tracks alongside, and how bookings
are organized in each app.

## Roles

- **Client** (CUSTOMER / SALON) — books care.
- **Provider** — provides care. Must be `approvedByAdmin` to receive/accept bookings.
- **Admin** — verifies Providers, oversees bookings, releases payouts.

## Booking statuses (`BookingStatus`)

```
REQUESTED → ACCEPTED → ON_MY_WAY → STARTED → COMPLETED
                                  ↘ CANCELLED (from REQUESTED/ACCEPTED/ON_MY_WAY)
```

| Status     | Meaning                                                        |
|------------|----------------------------------------------------------------|
| REQUESTED  | Client created it. Waiting for a Provider to accept.                |
| ACCEPTED   | A Provider took the job. Confirmed, not yet travelling.             |
| ON_MY_WAY  | Provider is travelling to the client.                               |
| STARTED    | Provider arrived; care in progress.                                 |
| COMPLETED  | Care finished. Triggers payment release + rating prompt.       |
| CANCELLED  | Cancelled by client/Provider/admin before STARTED. Payment refunded.|

## Payment / escrow (`PaymentStatus`) — runs in parallel

| PaymentStatus | When                                                          |
|---------------|---------------------------------------------------------------|
| PENDING       | Booking created, not yet charged.                             |
| AUTHORIZED/PAID | Funds **held in escrow** (client charged, Provider not paid).    |
| RELEASED      | Care complete → funds released to Provider; platform fee realized. |
| REFUNDED      | Booking cancelled → client refunded.                          |
| FAILED        | Charge failed.                                                |

Pre-Stripe this is mock; the ledger (held / released / platform fee) is in the
admin Revenue page and maps 1:1 onto Stripe charge→transfer later. Pricing:
`$25/hr`, 3 hr minimum; `platformFee` is Glow's cut, `providerPayout` the rest.

## The two booking modes

1. **Dedicated request** — the client picks a *specific* Provider (Browse / Near Me →
   "Select <name>"). Only that Provider may accept. This is the primary, care-industry
   model: the family chooses their caregiver.
2. **Open / on-demand** — no specific Provider. The booking is visible to nearby
   approved Providers in **Find Jobs**; the first to accept takes it.

## End-to-end flow

### 1. Client creates a booking (`POST /bookings`)
Steps in `CreateBookingScreen`: **Service → Date & time → Choose Provider → Confirm**.
- Confirm step shows price, escrow assurance, and a (mock) payment method.
- If a specific Provider was chosen, `providerId` is set and the booking is **dedicated**.
- Server validates the chosen Provider is `approvedByAdmin`.
- Booking is created `REQUESTED`. Payment authorized → **held in escrow**.

### 2. Provider is notified
- **Dedicated:** server emits `new-job-assigned` to that Provider + push. The request
  lands in the Provider's **Requests inbox** (persistent — see below) and raises a
  notification. It does **not** vanish on a timer.
- **Open:** the booking shows up in **Find Jobs / nearby** for all approved Providers
  within radius (no individual push spam).

### 3. Provider responds
- **Accept** (`POST /jobs/:id/accept`) → status `ACCEPTED`, `providerId` locked.
  Dedicated guard: a booking addressed to Provider A cannot be accepted by Provider B.
  Open jobs: first-come; conflict detection prevents double-booking a time slot.
- **Decline** (`POST /jobs/:id/skip`, optional `reason`) →
  - Dedicated: booking released (`providerId` cleared, back to `REQUESTED`); client is
    notified with the reason and re-picks a Provider (`POST /bookings/:id/reassign`).
  - Open: just hidden from that Provider's list; others can still take it.

### 4. Service lifecycle
`ACCEPTED → ON_MY_WAY → STARTED → COMPLETED`, each a Provider action, each emits
`booking-status-changed` to the client (live in Tracking) and admin.
Live Provider location streams during ON_MY_WAY/STARTED.

### 5. Completion
Provider marks `COMPLETED` → escrow **released** to Provider (fee realized) → client gets a
rating prompt; Provider can rate the client too.

### 6. Cancellation
`PATCH /bookings/:id/cancel` — allowed before `STARTED`.
- Client can cancel from **Tracking** or **Booking detail**.
- Provider declining a dedicated request is *not* a cancel — it releases the request.
- Cancel sets `CANCELLED` + `REFUNDED`, notifies the other party.

## Organization (how bookings are grouped in each app)

Both client and Provider lists use the same sectioning engine:

```
In Progress → Awaiting Provider → Today → Tomorrow → This Week → Later → Completed → Cancelled
```

- **Client — My Bookings:** tabs **Active / Upcoming / Past**, sectioned as above,
  each card shows the payment state (🔒 Held in escrow / ✓ Paid / Awaiting Provider).
- **Provider — My Jobs:** active-job hero on top, then the same sections; each completed
  card shows the payout breakdown (gross − fee = you, released/pending). Completed
  & cancelled are capped (full history in Earnings).
- **Provider — Requests inbox:** pending dedicated requests awaiting this Provider's
  accept/decline (replaces the old disappearing flash overlay).
- **Admin — Bookings:** grouped by date, with status + payment (escrow) badges and
  a payment filter.

## Why a Requests inbox instead of a timed flash card

The old flash overlay was a rideshare-style 30-second countdown. Care bookings are
scheduled and personal, not instant rides — a caregiver shouldn't lose a family's
request because a 30s timer elapsed. Care platforms use a **persistent request
inbox**: the Provider reviews each request and accepts/declines on their own time;
requests persist until actioned or the client cancels/reassigns. We keep a gentle
in-app notification, but the request lives in the inbox, not a countdown.
