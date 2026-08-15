-- MotoConnect schema — PostgreSQL + PostGIS (required)
-- Run via: npm run db:migrate

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('passenger', 'rider');
CREATE TYPE verification_status AS ENUM ('pending_verification', 'verified', 'rejected');
CREATE TYPE request_status AS ENUM (
  'CREATED', 'VISIBLE', 'CLAIMED', 'CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED',
  'EXPIRED', 'EXPIRED_UNCLAIMED', 'CANCELLED_BY_PASSENGER', 'CANCELLED_BY_RIDER', 'NO_SHOW'
);
CREATE TYPE subscription_tier AS ENUM ('agahozo', 'isonga', 'impuruza');
CREATE TYPE payment_provider AS ENUM ('paypack');
CREATE TYPE payment_status AS ENUM ('pending', 'success', 'failed');

-- ─── users ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone                      text NOT NULL UNIQUE CHECK (phone ~ '^\+2507[2389]\d{7}$'),
  name                       text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 50),
  role                       user_role NOT NULL,
  otp_code_hash              text,
  otp_expires_at             timestamptz,
  otp_attempts               int NOT NULL DEFAULT 0,
  otp_last_sent_at           timestamptz,
  location_consent_granted   boolean NOT NULL DEFAULT false,
  location_consent_at        timestamptz,
  consent_reconfirm_at       timestamptz,        -- when re-consent next becomes required
  review_flag                boolean NOT NULL DEFAULT false, -- e.g. 3 no-shows/month
  disabled                   boolean NOT NULL DEFAULT false,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

-- ─── rider_profiles ───────────────────────────────────────────────────────────
CREATE TABLE rider_profiles (
  user_id              uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  national_id          text NOT NULL CHECK (national_id ~ '^1\d{15}$'),
  license_number       text NOT NULL CHECK (char_length(license_number) >= 4),
  -- Rwandan plates are RA<series letter> <3 digits> <suffix letter>, e.g. RAD123B.
  -- That is THREE leading letters, not two.
  plate_number         text NOT NULL CHECK (plate_number ~ '^R[A-Z]{2}\d{3}[A-Z]$'),
  verification_status  verification_status NOT NULL DEFAULT 'pending_verification',
  verified_at          timestamptz,
  rejection_reason     text,
  reliability_score    numeric(3,2) NOT NULL DEFAULT 5.00,
  claim_suspended_until timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ─── subscriptions ────────────────────────────────────────────────────────────
CREATE TABLE subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id    uuid NOT NULL REFERENCES rider_profiles(user_id) ON DELETE CASCADE,
  tier        subscription_tier NOT NULL,
  claims_used int NOT NULL DEFAULT 0,
  claims_cap  int,                          -- NULL = unlimited (Impuruza)
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  starts_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_rider_active_idx ON subscriptions(rider_id) WHERE status = 'active';

-- ─── ride_requests ────────────────────────────────────────────────────────────
-- Exact pickup lives ONLY here, server-side. Riders receive a jittered marker
-- (see jitter_dlat/jitter_dlng) plus a distance band + compass direction.
CREATE TABLE ride_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status             request_status NOT NULL DEFAULT 'CREATED',
  pickup_geog        geography(POINT, 4326) NOT NULL,
  pickup_accuracy_m  real,
  destination_note   text CHECK (char_length(destination_note) <= 120),
  first_visible_at   timestamptz,
  claim_attempts     int NOT NULL DEFAULT 0,
  jitter_dlat        double precision,      -- anonymization offsets (~150-200 m), set once
  jitter_dlng        double precision,
  claimed_by         uuid REFERENCES rider_profiles(user_id) ON DELETE SET NULL,
  claimed_at         timestamptz,
  confirm_deadline   timestamptz,           -- claimed_at + 30 s
  confirmed_at       timestamptz,
  rider_arrived_at   timestamptz,
  completed_at       timestamptz,
  cancelled_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  cancel_reason      text,
  no_show_flag_at    timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ride_requests_status_idx ON ride_requests(status) WHERE status IN ('VISIBLE', 'CLAIMED');
CREATE INDEX ride_requests_passenger_open_idx ON ride_requests(passenger_id)
  WHERE status NOT IN ('COMPLETED','EXPIRED','EXPIRED_UNCLAIMED','CANCELLED_BY_PASSENGER','CANCELLED_BY_RIDER','NO_SHOW');
CREATE INDEX ride_requests_claimed_by_open_idx ON ride_requests(claimed_by)
  WHERE status IN ('CLAIMED','CONFIRMED','EN_ROUTE','ARRIVED');
CREATE INDEX ride_requests_pickup_gix ON ride_requests USING gist (pickup_geog);

-- ─── ride_events (audit trail; also powers cancellation quotas) ───────────────
CREATE TABLE ride_events (
  id               bigserial PRIMARY KEY,
  ride_request_id  uuid NOT NULL REFERENCES ride_requests(id) ON DELETE CASCADE,
  from_status      request_status,
  to_status        request_status NOT NULL,
  actor_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  meta             jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ride_events_request_idx ON ride_events(ride_request_id);
CREATE INDEX ride_events_actor_cancel_idx ON ride_events(actor_id, created_at)
  WHERE to_status IN ('CANCELLED_BY_PASSENGER','CANCELLED_BY_RIDER');

-- ─── payments (idempotent webhook handling via unique provider_ref) ───────────
CREATE TABLE payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  provider        payment_provider NOT NULL DEFAULT 'paypack',
  provider_ref    text UNIQUE,                       -- PayPack transaction ref; UNIQUE = idempotency key
  kind            text NOT NULL DEFAULT 'subscription',
  amount          int NOT NULL CHECK (amount > 0),   -- RWF
  status          payment_status NOT NULL DEFAULT 'pending',
  tier            subscription_tier,
  subscription_id uuid,                       -- set when the purchase activates
  processed_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb, -- dedupe duplicate webhook deliveries
  meta            jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);
CREATE INDEX payments_user_idx ON payments(user_id, created_at DESC);

-- ─── ratings (mandatory 2-way after COMPLETED) ────────────────────────────────
CREATE TABLE ratings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id  uuid NOT NULL REFERENCES ride_requests(id) ON DELETE CASCADE,
  rated_by         uuid NOT NULL REFERENCES users(id),
  rated_user       uuid NOT NULL REFERENCES users(id),
  stars            int NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment          text CHECK (char_length(comment) <= 280),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_request_id, rated_by)
);
CREATE INDEX ratings_ride_idx ON ratings(ride_request_id);

-- ─── trip_heatmap (aggregated, de-identified location retention) ─────────────
CREATE TABLE trip_heatmap (
  id          bigserial PRIMARY KEY,
  pickup_geog geography(POINT, 4326) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── user_locations (last known position; used for pool distance math) ────────
CREATE TABLE user_locations (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_lat   double precision NOT NULL,
  last_lng   double precision NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── apply schema updates ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS rider_profiles_updated_at ON rider_profiles;
CREATE TRIGGER rider_profiles_updated_at BEFORE UPDATE ON rider_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS ride_requests_updated_at ON ride_requests;
CREATE TRIGGER ride_requests_updated_at BEFORE UPDATE ON ride_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
