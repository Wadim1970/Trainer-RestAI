-- ============================================================
-- Тренажёр официанта (отдельный продукт RestAI Trainer): участники,
-- приглашения, сессии, ответы, повторение (FSRS), прогресс, настройки.
--
-- База общая с RestAI (restaurants, menu_items, trn_dish_facts из контент-
-- студии), поэтому эта миграция применяется ПОСЛЕ
--   RestAI/supabase/migrations/20261101020000_trainer_facts.sql
--
--  • Аккаунты тренажёра НЕЗАВИСИМЫ от приложения официанта (waiters): вход по
--    email (код из письма, Supabase Auth), членство — в trn_members.
--  • Регистрация только по приглашению: 1 код = 1 официант = 1 оплаченное
--    место. Код одноразовый, с сроком действия (trn_invites).
--  • Все таблицы закрыты для anon/authenticated: читает и пишет только сервер
--    (service_role), права проверяет код API по trn_members.
--
-- Запускать на сервере базы из-под supabase_admin:
--   sudo docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -v ON_ERROR_STOP=1 < 20261101030000_trainer_core.sql
-- Откат: 20261101030000_trainer_core_rollback.sql (данные обучения пропадут).
-- ============================================================

BEGIN;

-- Приглашения: код выдаёт администратор ресторана.
CREATE TABLE IF NOT EXISTS public.trn_invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code          text NOT NULL UNIQUE CHECK (code ~ '^[A-Z2-9]{8}$'),
  kind          text NOT NULL DEFAULT 'training' CHECK (kind IN ('training', 'assessment')),
  note          text,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  revoked_at    timestamptz
);
CREATE INDEX IF NOT EXISTS trn_invites_restaurant_idx ON public.trn_invites (restaurant_id, created_at DESC);

-- Участник (официант в тренажёре). auth_user_id — пользователь Supabase Auth (email).
CREATE TABLE IF NOT EXISTS public.trn_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  uuid NOT NULL UNIQUE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  invite_id     uuid REFERENCES public.trn_invites(id) ON DELETE SET NULL,
  name          text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  email         text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trn_members_restaurant_idx ON public.trn_members (restaurant_id);

ALTER TABLE public.trn_invites
  ADD COLUMN IF NOT EXISTS used_by uuid REFERENCES public.trn_members(id) ON DELETE SET NULL;

-- Настройки ресторана (пороги, лимиты, веса). Нет строки — умолчания из кода.
CREATE TABLE IF NOT EXISTS public.trn_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  value         jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Выданные сессии: сервер хранит вопросы с верными ответами и по ним проверяет ответы.
CREATE TABLE IF NOT EXISTS public.trn_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES public.trn_members(id) ON DELETE CASCADE,
  mode          text NOT NULL DEFAULT 'training' CHECK (mode IN ('training', 'assessment')),
  kind          text NOT NULL DEFAULT 'regular',
  questions     jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);
CREATE INDEX IF NOT EXISTS trn_sessions_member_idx ON public.trn_sessions (member_id, created_at DESC);

-- Каждый ответ. (session_id, qid) уникален: повторная отправка не удваивает баллы.
CREATE TABLE IF NOT EXISTS public.trn_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES public.trn_members(id) ON DELETE CASCADE,
  session_id    uuid NOT NULL REFERENCES public.trn_sessions(id) ON DELETE CASCADE,
  qid           text NOT NULL,
  card_key      text NOT NULL,
  dish_id       uuid,
  level         smallint NOT NULL,
  exercise      text NOT NULL,
  mode          text NOT NULL DEFAULT 'training',
  selected      jsonb NOT NULL,
  is_correct    boolean NOT NULL,
  confident     boolean NOT NULL,
  latency_ms    integer,
  points        integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, qid)
);
CREATE INDEX IF NOT EXISTS trn_attempts_member_idx ON public.trn_attempts (member_id, created_at DESC);

-- Состояние повторения по карточке (факт о блюде) для участника.
CREATE TABLE IF NOT EXISTS public.trn_card_states (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  member_id      uuid NOT NULL REFERENCES public.trn_members(id) ON DELETE CASCADE,
  card_key       text NOT NULL,
  dish_id        uuid NOT NULL,
  level          smallint NOT NULL,
  fsrs           jsonb NOT NULL,
  due_at         timestamptz NOT NULL,
  reps           integer NOT NULL DEFAULT 0,
  lapses         integer NOT NULL DEFAULT 0,
  last_review_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, card_key)
);
CREATE INDEX IF NOT EXISTS trn_card_states_due_idx ON public.trn_card_states (member_id, due_at);

-- Прогресс: баллы по уровням, серия дней.
CREATE TABLE IF NOT EXISTS public.trn_member_state (
  member_id        uuid PRIMARY KEY REFERENCES public.trn_members(id) ON DELETE CASCADE,
  restaurant_id    uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  level_points     jsonb NOT NULL DEFAULT '{}'::jsonb,
  streak_days      integer NOT NULL DEFAULT 0,
  last_active_date date,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['trn_invites', 'trn_members', 'trn_settings', 'trn_sessions', 'trn_attempts', 'trn_card_states', 'trn_member_state']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $do$;

COMMENT ON TABLE public.trn_invites IS 'Коды-приглашения тренажёра: 1 код = 1 официант (оплаченное место), одноразовый, со сроком.';
COMMENT ON TABLE public.trn_members IS 'Официанты в тренажёре. Независимы от public.waiters.';

COMMIT;
