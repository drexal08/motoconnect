-- ─────────────────────────────────────────────────────────────────────────────
-- 003 — indexes for the query patterns real usage actually produces.
--
-- The base schema indexed the ride-matching hot path. These cover the ops
-- console, which was written afterwards and whose searches would otherwise
-- sequentially scan every user and every payment on each keystroke.
--
-- The important one is pg_trgm: `name ILIKE '%eric%'` cannot use an ordinary
-- B-tree index, because a leading wildcard has no prefix to seek on. A trigram
-- index can, and the search box in Users and Payments fires on every keystroke.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── users: search, filter, and the default sort ─────────────────────────────
CREATE INDEX IF NOT EXISTS users_name_trgm_idx  ON users USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS users_phone_trgm_idx ON users USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS users_created_at_idx ON users (created_at DESC);
CREATE INDEX IF NOT EXISTS users_role_status_idx ON users (role, account_status);
-- Partial: the flagged-for-review filter looks only at the true rows, and those
-- are a tiny minority, so the index stays small however many users there are.
CREATE INDEX IF NOT EXISTS users_review_flag_idx ON users (id) WHERE review_flag = true;
-- Drives the sweeper's suspension-expiry pass.
CREATE INDEX IF NOT EXISTS users_suspended_until_idx ON users (suspended_until)
  WHERE account_status = 'suspended' AND suspended_until IS NOT NULL;

-- ─── verification queue (§4.1: oldest-first, filtered by status) ─────────────
CREATE INDEX IF NOT EXISTS rider_profiles_status_submitted_idx
  ON rider_profiles (verification_status, submitted_at);
-- Duplicate detection on the review panel checks both of these directly.
CREATE INDEX IF NOT EXISTS rider_profiles_national_id_idx ON rider_profiles (national_id);
CREATE INDEX IF NOT EXISTS rider_profiles_plate_idx       ON rider_profiles (plate_number);
-- Throughput metrics and the document retention purge both filter on decided_at.
CREATE INDEX IF NOT EXISTS rider_profiles_decided_at_idx ON rider_profiles (decided_at)
  WHERE decided_at IS NOT NULL;

-- ─── finance ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS payments_status_created_idx ON payments (status, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_provider_ref_trgm_idx
  ON payments USING gin (provider_ref gin_trgm_ops);
-- The reconciliation "paid but never activated" exception scans exactly this.
CREATE INDEX IF NOT EXISTS payments_orphan_idx ON payments (completed_at DESC)
  WHERE status = 'success' AND subscription_id IS NULL AND reconcile_state IS NULL;
CREATE INDEX IF NOT EXISTS payments_subscription_idx ON payments (subscription_id)
  WHERE subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_expires_idx ON subscriptions (expires_at DESC);
CREATE INDEX IF NOT EXISTS subscriptions_tier_status_idx ON subscriptions (tier, status);

-- ─── disputes (§5.2) ─────────────────────────────────────────────────────────
-- A low rating flags a ride for review, so this is a queue-driving lookup.
CREATE INDEX IF NOT EXISTS ratings_low_stars_idx ON ratings (ride_request_id) WHERE stars <= 2;
CREATE INDEX IF NOT EXISTS ratings_rated_user_idx ON ratings (rated_user, created_at DESC);
CREATE INDEX IF NOT EXISTS ride_requests_no_show_idx ON ride_requests (no_show_flag_at DESC)
  WHERE status = 'NO_SHOW';
-- Live ops polls this every few seconds while the console is open.
CREATE INDEX IF NOT EXISTS ride_requests_live_idx ON ride_requests (claimed_at)
  WHERE status IN ('CLAIMED', 'CONFIRMED', 'EN_ROUTE', 'ARRIVED');
-- Ride history on a user's page, from either side of the ride.
CREATE INDEX IF NOT EXISTS ride_requests_passenger_created_idx ON ride_requests (passenger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ride_requests_claimed_created_idx  ON ride_requests (claimed_by, created_at DESC)
  WHERE claimed_by IS NOT NULL;

-- ─── reports ─────────────────────────────────────────────────────────────────
-- Every daily report buckets by date over a trailing window.
CREATE INDEX IF NOT EXISTS ride_requests_created_at_idx ON ride_requests (created_at);
CREATE INDEX IF NOT EXISTS ride_requests_completed_at_idx ON ride_requests (completed_at)
  WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ride_events_created_at_idx ON ride_events (created_at);
