-- Schema reconciliation: repo migration history was behind live production.
-- Live DB already allows profiles.plan = 'unlimited'; this migration re-asserts
-- the constraint so fresh environments match production. No data is modified.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free','pro','unlimited','admin'));