-- ============================================================
-- Тренажёр: доступы официантов по списку email (вместо кодов-приглашений).
--
-- Администратор вносит email официанта — это одно оплаченное место на один курс.
-- Официант входит по email и коду из письма; сервер сверяет почту со списком.
-- Статусы: invited (внесён, ещё не входил) → active (идёт курс) → closed (доступ закрыт:
-- администратором или по завершении курса). Прогресс официанта сохраняется.
--
-- Таблица trn_invites (коды) остаётся как есть, но больше не используется.
-- Участники, уже зарегистрированные по кодам, переносятся в доступы как active.
--
-- ПОРЯДОК: применить ДО выкладки Trainer-RestAI с этой логикой.
-- Запускать на сервере базы из-под supabase_admin:
--   sudo docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -v ON_ERROR_STOP=1 < 20261106010000_trainer_enrollments.sql
-- Откат: 20261106010000_trainer_enrollments_rollback.sql
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.trn_enrollments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  email         text NOT NULL CHECK (email = lower(email) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'),
  name          text CHECK (name IS NULL OR length(btrim(name)) BETWEEN 1 AND 80),
  status        text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'closed')),
  closed_reason text CHECK (closed_reason IS NULL OR closed_reason IN ('admin', 'completed')),
  member_id     uuid REFERENCES public.trn_members(id) ON DELETE SET NULL,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  first_login_at timestamptz,
  closed_at     timestamptz,
  CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);

-- Одна почта — один открытый доступ (аккаунт тренажёра привязан к одному ресторану).
CREATE UNIQUE INDEX IF NOT EXISTS trn_enrollments_open_email_idx ON public.trn_enrollments (email) WHERE status <> 'closed';
CREATE INDEX IF NOT EXISTS trn_enrollments_restaurant_idx ON public.trn_enrollments (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS trn_enrollments_email_idx ON public.trn_enrollments (email, created_at DESC);

ALTER TABLE public.trn_enrollments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trn_enrollments FROM anon, authenticated;

COMMENT ON TABLE public.trn_enrollments IS 'Доступы официантов к тренажёру: 1 email = 1 оплаченное место на один курс. Ведёт администратор ресторана.';

-- Уже зарегистрированные по кодам (кроме демо-аккаунтов) сохраняют доступ.
INSERT INTO public.trn_enrollments (restaurant_id, email, name, status, member_id, created_by, created_at, first_login_at)
SELECT m.restaurant_id, lower(btrim(m.email)), m.name, 'active', m.id, 'Перенос из кодов', m.created_at, m.created_at
FROM public.trn_members m
WHERE lower(m.email) NOT LIKE '%@demo.restai.pro'
  AND lower(btrim(m.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
ON CONFLICT DO NOTHING;

COMMIT;
