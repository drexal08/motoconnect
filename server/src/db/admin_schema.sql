-- ─────────────────────────────────────────────────────────────────────────────
-- MotoConnect OPS CONSOLE schema (admin spec §2, §5, §6, §7, §9).
--
-- This file EXTENDS schema.sql — it never redefines users / rider_profiles /
-- ride_requests / subscriptions / payments (the main PRD owns those). It is
-- fully idempotent so `npm run db:migrate` can be re-run at any time.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── enums ────────────────────────────────────────────────────────────────────
-- §2.1: all three roles defined now even though only super_admin is seeded, so
-- adding an admin later is an INSERT, not a code change.
DO $$ BEGIN
  CREATE TYPE admin_role AS ENUM ('super_admin', 'support', 'finance_ops');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE admin_account_status AS ENUM ('active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- §6.2 / §5.2: platform user moderation state (separate from the pre-existing
-- boolean users.disabled, which we keep in sync so the consumer app honours it).
DO $$ BEGIN
  CREATE TYPE account_status AS ENUM ('active', 'suspended', 'banned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── admin_users (§2.1) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                   text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash           text,                       -- NULL until the first-login password-set flow completes
  role                    admin_role NOT NULL,
  mfa_enabled             boolean NOT NULL DEFAULT false,
  mfa_secret              text,                       -- base32 TOTP secret; only meaningful with mfa_enabled
  mfa_pending_secret      text,                       -- staged during enrolment, promoted once a code verifies
  status                  admin_account_status NOT NULL DEFAULT 'active',
  -- §2.2: no default password ever exists. A one-time setup token is emailed and
  -- the account cannot authenticate until the operator sets their own password.
  setup_token_hash        text,
  setup_token_expires_at  timestamptz,
  password_set_at         timestamptz,
  failed_login_count      int NOT NULL DEFAULT 0,
  locked_until            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  last_login_at           timestamptz
);

-- ─── admin_sessions (§2.3) ────────────────────────────────────────────────────
-- Server-side sessions, not stateless JWTs: an admin session must be revocable
-- the moment an account is suspended, and idle-timeout must be enforceable
-- server-side (30 min super_admin/finance_ops, 2 h support).
CREATE TABLE IF NOT EXISTS admin_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id  uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash     text NOT NULL UNIQUE,   -- sha256 of the opaque bearer token; the raw token is never stored
  mfa_satisfied  boolean NOT NULL DEFAULT false,
  ip_address     text,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  absolute_expires_at timestamptz NOT NULL,
  revoked_at     timestamptz
);
CREATE INDEX IF NOT EXISTS admin_sessions_admin_idx ON admin_sessions(admin_user_id) WHERE revoked_at IS NULL;

-- ─── admin_audit_log (§9.1) ───────────────────────────────────────────────────
-- Append-only. No updated_at, no deleted_at, and (below) no UPDATE or DELETE
-- path at all — enforced by a trigger, not by convention. Corrections are new
-- rows that reference the original via meta->>'corrects'.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id               bigserial PRIMARY KEY,
  admin_user_id    uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  admin_email      text,                    -- denormalised so history survives account deletion
  action_type      text NOT NULL,
  target_type      text NOT NULL,
  target_id        text,
  reason_code      text,
  reason_freetext  text,
  before_state     jsonb,
  after_state      jsonb,
  ip_address       text,
  user_agent       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_admin_idx   ON admin_audit_log(admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx  ON admin_audit_log(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx  ON admin_audit_log(action_type, created_at DESC);

-- §9.1 "tamper-evident" in practice: the database itself refuses history edits,
-- so a compromised application layer (or a careless super_admin) still cannot
-- rewrite the record. There is no second human reviewer — the log is the control.
CREATE OR REPLACE FUNCTION admin_audit_log_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_audit_log_no_update ON admin_audit_log;
CREATE TRIGGER admin_audit_log_no_update BEFORE UPDATE ON admin_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION admin_audit_log_is_append_only();

DROP TRIGGER IF EXISTS admin_audit_log_no_delete ON admin_audit_log;
CREATE TRIGGER admin_audit_log_no_delete BEFORE DELETE ON admin_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION admin_audit_log_is_append_only();

-- ─── platform user moderation (§5.2, §6.2) ───────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status   account_status NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until  timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status_reason    text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_notes      text;

-- Warnings/strikes issued from the dispute queue.
CREATE TABLE IF NOT EXISTS user_strikes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_user_id  uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  ride_request_id uuid REFERENCES ride_requests(id) ON DELETE SET NULL,
  reason_code    text NOT NULL,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_strikes_user_idx ON user_strikes(user_id, created_at DESC);

-- ─── plate-number constraint repair ──────────────────────────────────────────
-- The original CHECK was '^R[A-Z]\d{3}[A-Z]$' — two leading letters — which
-- rejects every real Rwandan plate, including the format the app's own error
-- message tells riders to use (RAD123B) and the values in its own dev seed. No
-- rider could complete signup, so the verification queue could never receive a
-- single application. Repaired here so existing databases are fixed too, not
-- just fresh ones created from schema.sql.
ALTER TABLE rider_profiles DROP CONSTRAINT IF EXISTS rider_profiles_plate_number_check;
ALTER TABLE rider_profiles ADD CONSTRAINT rider_profiles_plate_number_check
  CHECK (plate_number ~ '^R[A-Z]{2}\d{3}[A-Z]$');

-- ─── verification queue support (§4.2) ───────────────────────────────────────
ALTER TABLE rider_profiles ADD COLUMN IF NOT EXISTS submitted_at       timestamptz NOT NULL DEFAULT now();
-- Backfill: without this, every rider already waiting in the queue would look
-- like they applied the moment this migration ran, resetting the §4.1 age flag
-- and hiding exactly the backlog the queue exists to surface.
UPDATE rider_profiles SET submitted_at = created_at WHERE submitted_at > created_at;
ALTER TABLE rider_profiles ADD COLUMN IF NOT EXISTS rejection_code     text;
ALTER TABLE rider_profiles ADD COLUMN IF NOT EXISTS info_requested_at  timestamptz;
ALTER TABLE rider_profiles ADD COLUMN IF NOT EXISTS info_request_note  text;
ALTER TABLE rider_profiles ADD COLUMN IF NOT EXISTS decided_at         timestamptz;
ALTER TABLE rider_profiles ADD COLUMN IF NOT EXISTS decided_by         uuid REFERENCES admin_users(id) ON DELETE SET NULL;

-- §12 open question #1, now closed: the consumer signup captures photographs of
-- the National ID, licence and plate, so a verification decision has something
-- to check the typed numbers against. `storage_url` holds an opaque filename
-- inside UPLOAD_DIR, never a public URL — the bytes are only reachable through
-- an authenticated admin route (see lib/uploads.ts).
CREATE TABLE IF NOT EXISTS rider_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id     uuid NOT NULL REFERENCES rider_profiles(user_id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('national_id', 'license', 'plate', 'selfie')),
  storage_url  text NOT NULL,
  mime_type    text,
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rider_documents ADD COLUMN IF NOT EXISTS byte_size int;
ALTER TABLE rider_documents ADD COLUMN IF NOT EXISTS checksum  text;
-- One current image per kind per rider: a resubmission replaces the old one
-- rather than stacking, so the reviewer is never guessing which photo is live.
CREATE UNIQUE INDEX IF NOT EXISTS rider_documents_rider_kind_idx ON rider_documents(rider_id, kind);
CREATE INDEX IF NOT EXISTS rider_documents_rider_idx ON rider_documents(rider_id);

-- ─── dispute queue (§5.2) ─────────────────────────────────────────────────────
-- The queue itself is DERIVED (NO_SHOW rides + rides with a ≤2★ rating). This
-- table only records the admin's resolution, so no backfill job is needed and
-- a ride can never sit in two states at once.
CREATE TABLE IF NOT EXISTS dispute_reviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id  uuid NOT NULL UNIQUE REFERENCES ride_requests(id) ON DELETE CASCADE,
  outcome          text NOT NULL CHECK (outcome IN ('dismissed', 'warned', 'suspended', 'banned')),
  reason_code      text,
  note             text,
  resolved_by      uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  resolved_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── live ops location trail (§5.1) ───────────────────────────────────────────
-- Breadcrumb trail for rides that are currently in flight. Deliberately short
-- retention (pruned by the sweeper): enough to review a fresh dispute, not a
-- long-term location store — the main PRD's retention model still applies.
CREATE TABLE IF NOT EXISTS ride_tracks (
  id               bigserial PRIMARY KEY,
  ride_request_id  uuid NOT NULL REFERENCES ride_requests(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lat              double precision NOT NULL,
  lng              double precision NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ride_tracks_ride_idx ON ride_tracks(ride_request_id, recorded_at);

-- ─── finance (§7.1, §7.2, §7.3) ───────────────────────────────────────────────
-- §7.1: riders repeatedly hitting their claim cap — the upsell signal. Recorded
-- where the cap is actually enforced, not inferred later.
CREATE TABLE IF NOT EXISTS quota_block_events (
  id              bigserial PRIMARY KEY,
  rider_id        uuid NOT NULL REFERENCES rider_profiles(user_id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  tier            subscription_tier,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quota_block_events_rider_idx ON quota_block_events(rider_id, created_at DESC);

-- §7.2: manual reconciliation actions. Freetext note is NOT NULL — this is money.
CREATE TABLE IF NOT EXISTS payment_reconciliations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id     uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  admin_user_id  uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  action         text NOT NULL CHECK (action IN ('link_subscription', 'mark_void', 'mark_resolved')),
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  note           text NOT NULL CHECK (char_length(btrim(note)) >= 3),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_reconciliations_payment_idx ON payment_reconciliations(payment_id, created_at DESC);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS reconcile_state text
  CHECK (reconcile_state IS NULL OR reconcile_state IN ('resolved', 'void'));
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;

-- §7.3: refunds. `settlement` records the honest truth about whether money
-- actually moved — see server/src/services/admin/financeService.ts for why a
-- programmatic provider refund is NOT assumed to exist.
CREATE TABLE IF NOT EXISTS refunds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id      uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  ride_request_id uuid REFERENCES ride_requests(id) ON DELETE SET NULL,
  admin_user_id   uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  amount          int NOT NULL CHECK (amount > 0),
  reason_code     text NOT NULL,
  reason_freetext text NOT NULL CHECK (char_length(btrim(reason_freetext)) >= 3),
  settlement      text NOT NULL DEFAULT 'manual_offline'
                    CHECK (settlement IN ('manual_offline', 'provider_api', 'provider_failed')),
  provider_ref    text,
  settled_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refunds_payment_idx ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS refunds_created_idx ON refunds(created_at DESC);
