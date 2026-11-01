-- Откат 20261101030000_trainer_core.sql. Все данные тренажёра (участники,
-- приглашения, ответы, прогресс) удаляются без возврата.
BEGIN;
DROP TABLE IF EXISTS public.trn_member_state;
DROP TABLE IF EXISTS public.trn_card_states;
DROP TABLE IF EXISTS public.trn_attempts;
DROP TABLE IF EXISTS public.trn_sessions;
DROP TABLE IF EXISTS public.trn_settings;
ALTER TABLE IF EXISTS public.trn_invites DROP COLUMN IF EXISTS used_by;
DROP TABLE IF EXISTS public.trn_members;
DROP TABLE IF EXISTS public.trn_invites;
COMMIT;
