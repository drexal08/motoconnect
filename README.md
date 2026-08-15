# MotoConnect

Rwandan moto-taxi platform: real-time matching, GPS tracking, mobile-money subscriptions.

Two products live in this repo:

| Surface | Entry | Who it is for |
| --- | --- | --- |
| Consumer app | `index.html` → `src/` | Passengers and riders. Emerald/Amber brand, plain English, outdoor-mobile legibility. |
| **Ops console** | `admin.html` → `src/admin/` | The platform owner. Neutral slate admin theme, dense tables, desktop-first. |

They share a typeface, the Imigongo motif and the green accent, and nothing else — the console
deliberately does not wear the consumer brand.

---

**Deploying?** See [DEPLOYMENT.md](DEPLOYMENT.md) — Vercel + Render + Neon + Cloudflare R2,
all on free plans, nothing that needs a human to wake it up.

## Running it

```bash
# 1. Database (PostgreSQL 14+ with PostGIS)
createdb motoconnect
cd server && cp .env.example .env      # set DATABASE_URL
npm install
npm run db:migrate                     # base schema + ops-console schema
npm run db:seed                        # dev fixtures (never run against production)

# 2. API + WebSocket on :4000
npm run dev

# 3. Both front ends on :3000
cd .. && npm install && npm run dev
#   consumer app  → http://localhost:3000/
#   ops console   → http://localhost:3000/admin.html
```

`npm run db:migrate` is safe to re-run: the base schema is applied only to an empty database, and
the ops-console schema is written to be idempotent.

---

## Ops console

Full specification in the admin PRD. Screens: Dashboard, Verification Queue, Live Ops, Users,
Finance, Reports, Audit Log, Settings.

### First sign-in

On first boot against an empty database the server creates exactly one admin account —
`byiringirinnocent8@gmail.com`, role `super_admin` — with **no password**. A one-time setup link is
emailed to it; without `POSTMARK_SERVER_TOKEN` configured the link is printed to the server console
and the code reports plainly that it was *not* delivered.

```bash
cd server
npm run db:seed:admin              # show admin accounts / create the seed one
npm run db:seed:admin -- --resend  # issue a fresh setup link
```

The email address is an **identifier, not a credential**. Access to that inbox yields a one-time
setup link and nothing else. Authentication is a password the operator chooses (bcrypt, 12+ chars)
plus a TOTP second factor, which is mandatory for `super_admin` and `finance_ops`.

### Roles

Defined in data, not in code — adding an operator is an insert plus a role value.

| Role | Access |
| --- | --- |
| `super_admin` | Everything. The only role that can manage admin accounts. |
| `support` | Read-only on rides, users and disputes. No payments, no verification decisions. |
| `finance_ops` | Payments, subscriptions, refunds. No verification, no bans. |

### Sessions

Server-side rows in `admin_sessions`, not stateless JWTs, so a session dies the moment an account is
suspended. Idle timeout is 30 min for `super_admin`/`finance_ops` and 2 h for `support`; every
session expires absolutely at 12 h. There is no "remember me" on this surface.

### Deployment

Serve `admin.html` from its own host — `ops.motoconnect.rw`, not `motoconnect.rw/admin` — and do not
link to it from any public page. Set `ADMIN_CONSOLE_URL` so setup links point at the right place, and
`ADMIN_ORIGIN` to restrict the admin API's CORS to that host.

### The audit log

Every gated action writes to `admin_audit_log` in the **same transaction** as the state change it
describes: if the audit row cannot be written, the change does not commit. The table is append-only
and a database trigger refuses `UPDATE` and `DELETE` outright, including for a `super_admin`.
Corrections are new rows, never edits to history. With one operator and no second reviewer, the log
is the control.

### Maps

The ops console map runs on Leaflet + OpenStreetMap and needs **no API key**, so live ops keeps
working regardless of Google billing or a missing env var on the ops host. The consumer app still
uses Google Maps via `VITE_GOOGLE_MAPS_API_KEY`.

### Email (Postmark)

Set `POSTMARK_SERVER_TOKEN` to the **Server** token (Servers → your server → API Tokens), not the
Account token, and make `EMAIL_FROM` a verified Sender Signature or an address on a verified domain.
Those two are the usual reasons a setup link never arrives, and the mailer translates both error
codes into plain language in the server log instead of surfacing a bare number.

Postmark can reject a message while still returning HTTP 200 with a non-zero `ErrorCode`, so both
are checked — a send is only reported as delivered when it actually was.

---

## Rider verification documents

Riders photograph their **National ID, driving licence and plate** during signup
(`/rider/documents`). Without them, verification receives typed numbers and nothing else, and an
admin can only ever approve on trust — sixteen plausible digits are free to invent.

- Photos are **downscaled in the browser** to a 1600px longest edge before upload. A 4 MB camera
  shot becomes roughly 200 kB, which matters when riders are outdoors paying for their own data.
  Passing through a canvas also strips EXIF, so the GPS coordinates phones stamp into photos never
  reach the server.
- Files go to **Cloudflare R2** in production (private bucket, 10 GB free, zero egress) and to
  `UPLOAD_DIR` on local disk in development. Storage is a driver interface in
  `server/src/lib/storage.ts`, so swapping providers is one file. **Nothing serves the bucket
  publicly.** The only path to the bytes is
  `GET /api/admin/verification/:riderId/documents/:docId/file` behind an authenticated admin
  session, and every view is written to the audit log alongside ID reveals.
- R2 is signed with a hand-written AWS SigV4 implementation
  (`server/src/lib/sigv4.ts`) rather than the AWS SDK — three verbs against one endpoint does not
  justify tens of megabytes on a free host. It is cross-checked against both AWS's published
  worked example and `@aws-sdk/signature-v4` in the test suite.
- Uploads are sniffed for a real JPEG/PNG/WebP magic number. A declared MIME type is a claim, not
  evidence.
- One current image per kind: a resubmission replaces the previous file rather than stacking, so a
  reviewer is never guessing which photo is live.
- Images are purged `RIDER_DOCUMENT_RETENTION_DAYS` after a verification decision (default 365).
  Pending applications are never purged. The decision and its audit trail outlive the images.

`server/uploads/` is gitignored. On a host with an ephemeral filesystem, point `UPLOAD_DIR` at a
mounted persistent volume.

---

## Known gaps and open questions

1. ~~**Rider signup captures numbers, not documents.**~~ **Closed** — document capture is built; see
   the section above. The review panel still names exactly which of the three required photos are
   missing when an application is incomplete, so an approval on typed numbers alone is always a
   visible choice rather than an accident.

2. **Refunds are records, not payouts.** Not yet enabled, by decision. Checked against the providers
   rather than assumed:
   MotoConnect settles through PayPack, whose API exposes cash-in and cash-out but no reversal of a
   specific transaction. Upstream, MTN MoMo puts refund under its separate
   [Disbursement product](https://momodeveloper.mtn.com/) and
   [Airtel](https://developers.airtel.africa/)'s collection refund is not reachable from behind the
   aggregator. A MotoConnect refund is therefore a *new outbound disbursement* needing a funded
   float, and it does not return the original transaction fee. Refunds are recorded and marked
   `manual_offline` until an operator pays out and records the reference. `PAYPACK_REFUND_ENABLED`
   is the switch, off until that payout path is confirmed with PayPack.

3. ~~**Transactional email provider.**~~ **Closed** — Postmark. See the Email section above for the
   two settings that decide whether a setup link actually arrives.

4. **When does one super_admin stop being an acceptable control?** Duties are being split: the
   `support` and `finance_ops` roles exist for exactly this, and adding an operator is a form in
   Settings. Worth revisiting once someone other than the owner holds `finance_ops`, since no second
   reviewer signs off a refund or a ban even then — the audit log makes every action attributable,
   but it prevents nothing.

   One thing to decide as you delegate: `support` is view-only and `finance_ops` cannot touch
   verification or bans, but **both roles can read rider ID photographs and reveal National ID
   numbers**, and every such view is logged. If document access should be narrower than that, say so
   and it becomes a role check on one route.

### Bug found and fixed on the way

The `rider_profiles.plate_number` constraint was `^R[A-Z]\d{3}[A-Z]$` — two leading letters. Real
Rwandan plates have three (`RAD123B`), which is also the example in the app's own error message and
the format of its own dev seed data. No rider could complete signup, so the verification queue could
never have received a single application. Fixed in `schema.sql`, repaired for existing databases in
`admin_schema.sql`, and the API now normalises spacing before validating.
