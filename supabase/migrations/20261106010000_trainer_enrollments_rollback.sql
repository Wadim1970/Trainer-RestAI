-- Откат 20261106010000_trainer_enrollments.sql: список доступов пропадёт.
-- После отката выкладывайте и прежнюю версию Trainer-RestAI (вход по кодам).
BEGIN;
DROP TABLE IF EXISTS public.trn_enrollments;
COMMIT;
