-- ============================================================
-- CWI Inspection App – Supabase Database Schema
-- Run this entire script in the Supabase SQL Editor
-- (Dashboard → SQL Editor → New query → Paste → Run)
-- ============================================================

-- ---------------------------------------------------------------
-- 1. BUILDINGS (top-level inspection projects)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.buildings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  address     TEXT,
  client      TEXT,
  inspector   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.buildings IS 'Top-level inspection project / building record.';

-- ---------------------------------------------------------------
-- 2. FLOORS (one per level inside a building)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.floors (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id   UUID        NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,           -- e.g. "Level 1", "Roof"
  floor_index   INT         NOT NULL DEFAULT 0, -- sort order
  floor_plan_url TEXT,                          -- Storage public URL for the floor-plan image
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.floors IS 'A single floor / level within a building.';

CREATE INDEX IF NOT EXISTS idx_floors_building_id ON public.floors(building_id);

-- ---------------------------------------------------------------
-- 3. FINDINGS (individual weld / defect observations)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.findings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id        UUID        NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  building_id     UUID        NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,

  -- Pin position (percentage-based so it scales with any floor-plan image)
  pin_x           FLOAT       NOT NULL DEFAULT 0,
  pin_y           FLOAT       NOT NULL DEFAULT 0,
  pin_number      INT         NOT NULL DEFAULT 1,

  -- Inspection data
  status          TEXT        NOT NULL DEFAULT 'OPEN'
                                CHECK (status IN ('OPEN', 'PASS', 'FAIL', 'MONITOR')),
  weld_id         TEXT,
  description     TEXT,
  category        TEXT,       -- e.g. "Structural Weld", "Porosity", "Undercut"
  severity        TEXT        CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
  notes           TEXT,

  -- Signatures / photos (Storage public URLs)
  inspector_signature_url  TEXT,
  photo_url                TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.findings IS 'Individual inspection finding pinned to a floor plan.';

CREATE INDEX IF NOT EXISTS idx_findings_floor_id    ON public.findings(floor_id);
CREATE INDEX IF NOT EXISTS idx_findings_building_id ON public.findings(building_id);

-- ---------------------------------------------------------------
-- 4. AUTO-UPDATE updated_at via trigger function
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_buildings_updated_at
  BEFORE UPDATE ON public.buildings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_floors_updated_at
  BEFORE UPDATE ON public.floors
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_findings_updated_at
  BEFORE UPDATE ON public.findings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------
-- 5. ROW LEVEL SECURITY – DISABLED FOR MVP (enable later)
-- ---------------------------------------------------------------
ALTER TABLE public.buildings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.floors    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings  DISABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------
-- 6. STORAGE BUCKETS
--    Run these statements separately if the SQL editor raises an
--    error – some Supabase plans require bucket creation via the
--    Dashboard UI (Storage → New bucket).
-- ---------------------------------------------------------------

-- Bucket for floor-plan images (uploaded once per floor)
INSERT INTO storage.buckets (id, name, public)
VALUES ('floor_plans', 'floor_plans', true)
ON CONFLICT (id) DO NOTHING;

-- Bucket for inspector signature images (attached to findings)
INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', true)
ON CONFLICT (id) DO NOTHING;

-- Public read policies for both buckets (no auth required for MVP)
CREATE POLICY "Public read floor_plans"
  ON storage.objects FOR SELECT
  USING ( bucket_id = 'floor_plans' );

CREATE POLICY "Public read signatures"
  ON storage.objects FOR SELECT
  USING ( bucket_id = 'signatures' );

CREATE POLICY "Public insert floor_plans"
  ON storage.objects FOR INSERT
  WITH CHECK ( bucket_id = 'floor_plans' );

CREATE POLICY "Public insert signatures"
  ON storage.objects FOR INSERT
  WITH CHECK ( bucket_id = 'signatures' );

-- ============================================================
-- END OF SCHEMA – your database is ready for Phase 4 wiring!
-- ============================================================
