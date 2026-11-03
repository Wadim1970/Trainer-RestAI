# Запуск тренажёра: что нужно сделать на серверах

Три вещи, без которых тренажёр не заработает: **почта**, **миграции базы**, **переменные окружения**. Ниже — по порядку, с командами и проверками. Метки: **[Certain]** — следует из наших репозиториев; **[Likely]** — по стандартной установке Supabase, на вашем сервере проверьте; **[Guessing]** — оценка.

## 0. Что где стоит

По репозиториям RestAI (`deploy/README.md`, `docs/infra-n8n-plan.md`): [Certain]

| Что | Где | Как управляется |
|---|---|---|
| База и Supabase (контейнеры `supabase-db`, …) | отдельный сервер с Supabase | `sudo docker exec …` |
| Приложения RestAI (guest, waiter, admin) | основной VPS, папка `/opt/restai/<репозиторий>` | nginx + pm2, `deploy/*.sh` |
| API гостя/официанта | pm2: `restai-guest-api` (порт 3001), `restai-waiter-api` (3002) | `deploy/api-server.mjs` |
| **Тренажёр (новое)** | тот же VPS, `/opt/restai/Trainer-RestAI`, pm2 `restai-trainer-api` (порт **3003**) | `deploy/setup-trainer.sh`, автообновление |

## 1. Сначала: код должен попасть в рабочие ветки

[Certain] Всё, что сделано под тренажёр, лежит в ветках `claude/zen-bell-ic436h` репозиториев RestAI, Waiter-app, Admin-restai и Trainer-RestAI. Автовыкладка (`deploy/auto-update.sh`) следит за `main` (RestAI, Admin-restai) и `RestAI-weiter` (Waiter-app). **Пока ветки не слиты, на сервере этого кода нет.**

| Репозиторий | Что в ветке | Куда слить |
|---|---|---|
| RestAI | поле чаевых в окне оплаты; миграции `…010000_table_tips`, `…020000_trainer_facts`; документ | `main` |
| Waiter-app | API контент-студии (`api/admin/trainer-facts.js`) | `RestAI-weiter` |
| Admin-restai | «Обучение»: Контент-студия, Приглашения | `main` |
| Trainer-RestAI | всё приложение | `main` (создать из ветки) |

## 2. Почта (SMTP) в Supabase Auth

Код из письма отправляет сам Supabase Auth (сервис GoTrue, контейнер `supabase-auth`) [Likely]. В наших репозиториях отправки почты нет, поэтому первым делом узнайте, что настроено.

### 2.1 Что уже настроено (на сервере Supabase)

```bash
sudo docker inspect supabase-auth --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^GOTRUE_(SMTP_(HOST|PORT|USER|ADMIN_EMAIL|SENDER_NAME|MAX_FREQUENCY)|MAILER_[A-Z_]+|RATE_LIMIT_EMAIL_SENT|SITE_URL|EXTERNAL_EMAIL_ENABLED|DISABLE_SIGNUP)='
```

Команда **намеренно не печатает `SMTP_PASS`** — не добавляйте его в вывод и не пересылайте. Если имя контейнера другое — `sudo docker ps --format '{{.Names}}' | grep -i auth`.

Что смотреть в выводе:
- `GOTRUE_SMTP_HOST` пустой или `supabase-mail`/`inbucket` → настоящей почты нет, делайте 2.2.
- `GOTRUE_MAILER_AUTOCONFIRM=true` → поставьте `false` (иначе почта не подтверждается кодом).
- `GOTRUE_EXTERNAL_EMAIL_ENABLED=false` → включите (иначе вход по email невозможен). `GOTRUE_DISABLE_SIGNUP=true` допустимо: пользователей для тренажёра заводит сервер сам.

### 2.2 Настроить SMTP

На вашем домене `restai.pro` уже работает Яндекс-почта (в `deploy/README.md` записи MX/TXT «Яндекс-почта» помечены «не трогать») [Certain]. Самое простое — завести там ящик `trainer@restai.pro` и использовать его.

В `.env` Supabase (рядом с `docker-compose.yml`, обычно `…/docker/.env`) [Likely]:

```
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_USER=trainer@restai.pro
SMTP_PASS=<пароль приложения из Яндекс 360, не пароль ящика>
SMTP_ADMIN_EMAIL=trainer@restai.pro
SMTP_SENDER_NAME=RestAI Тренажёр
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=false
SITE_URL=https://<домен тренажёра>
```

Затем перезапустите только сервис авторизации: `sudo docker compose up -d --force-recreate auth` (из папки с `docker-compose.yml`).

Чтобы письма не попадали в спам: в Яндекс 360 для домена включите **DKIM**, проверьте SPF-запись (`v=spf1 include:_spf.yandex.net ~all`) и DMARC [Likely]. Дневной лимит отправки у ящика Яндекса ограничен (порядка сотен писем) [Guessing] — для старта достаточно, при росте переходите на транзакционный сервис рассылок.

### 2.3 Шаблоны писем: в них должен быть код, а не только ссылка

Без этого официант получит письмо со ссылкой, а приложение ждёт код. Шаблоны уже лежат в репозитории (`public/mail/confirmation.html` и `public/mail/magic_link.html`, в них `{{ .Token }}`) и после выкладки доступны по адресу `https://<домен тренажёра>/mail/…`.

**Нужны оба шаблона:** новому пользователю (регистрация) уходит «Confirm signup», существующему (вход) — «Magic Link» [Likely]. Добавьте в сервис `auth` в `docker-compose.yml` (или в `docker-compose.override.yml`):

```yaml
    environment:
      GOTRUE_MAILER_TEMPLATES_CONFIRMATION: https://<домен тренажёра>/mail/confirmation.html
      GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: https://<домен тренажёра>/mail/magic_link.html
      GOTRUE_MAILER_SUBJECTS_CONFIRMATION: Код для регистрации в тренажёре
      GOTRUE_MAILER_SUBJECTS_MAGIC_LINK: Код для входа в тренажёр
      GOTRUE_MAILER_OTP_LENGTH: "6"
      GOTRUE_RATE_LIMIT_EMAIL_SENT: "200"
```

Пояснения:
- Supabase забирает шаблон по адресу в момент отправки. **Если адрес недоступен, он молча берёт стандартный шаблон со ссылкой** [Likely] — поэтому проверка в 2.4 обязательна.
- `GOTRUE_RATE_LIMIT_EMAIL_SENT` — общий лимит писем в час на весь проект; по умолчанию он небольшой (порядка 30) [Likely], а ресторан может зарегистрировать десяток официантов за раз. Подберите под реальную нагрузку.
- Между повторными запросами кода для одного адреса Supabase выдерживает паузу (по умолчанию 1 минута, `GOTRUE_SMTP_MAX_FREQUENCY`) [Likely]. Приложение пока показывает её английский текст ошибки как есть — это ближайшая доработка.

### 2.4 Проверка почты (до всего остального)

С любого компьютера, подставив ваш адрес и ключ **anon** (публичный, тот же, что `VITE_SUPABASE_ANON_KEY` в приложениях):

```bash
curl -s -X POST "$VITE_SUPABASE_URL/auth/v1/otp" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"ВАША_ПОЧТА@example.com","create_user":true}'
```

Ожидание: ответ `{}` и письмо с **шестизначным кодом** (не ссылкой) в течение минуты. Если письма нет: `sudo docker logs --tail 50 supabase-auth` (ошибки SMTP видны там). Если пришла ссылка, а не код — не подхватился шаблон (адрес недоступен с сервера Supabase или опечатка в переменной).

## 3. Миграции базы

**Три** миграции ждут применения (не две — есть ещё чаевые). Порядок важен: [Certain]

| № | Файл | Репозиторий | Что создаёт |
|---|---|---|---|
| 1 | `20261101010000_table_tips.sql` | RestAI | чаевые в окне оплаты (`table_tips`, `record_table_tip`) |
| 2 | `20261101020000_trainer_facts.sql` | RestAI | факты о блюдах и журнал (контент-студия) |
| 3 | `20261101030000_trainer_core.sql` | Trainer-RestAI | приглашения, участники, сессии, ответы, прогресс |
| 4 | `20261105010000_trainer_wine_facts.sql` | RestAI | типы фактов «сорт винограда», «год урожая» |
| 5 | `20261106010000_trainer_enrollments.sql` | Trainer-RestAI | доступы официантов по email (`trn_enrollments`); уже зарегистрированные по кодам переносятся как «идёт курс» |

Миграция 3 ссылается на таблицу `restaurants`; миграция 2 — на `restaurants` и `menu_items`. Миграцию 1 можно не применять, если чаевые пока не нужны, но тогда **не выкладывайте** новое окно оплаты (оно вызовет `record_table_tip` при выборе чаевых).

### 3.1 Бэкап (обязательно)

На сервере Supabase:

```bash
sudo docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc > ~/backup-before-trainer-$(date +%F).dump
ls -la ~/backup-before-trainer-*.dump
```

### 3.2 Применение

Тот же способ, что у остальных миграций (`deploy/README.md`). Файлы лежат в репозиториях на основном VPS; удобнее всего передать их по ssh прямо в контейнер, не копируя на сервер базы:

```bash
DB=<пользователь>@<адрес сервера Supabase>
cd /opt/restai
for f in RestAI/supabase/migrations/20261101010000_table_tips.sql \
         RestAI/supabase/migrations/20261101020000_trainer_facts.sql \
         Trainer-RestAI/supabase/migrations/20261101030000_trainer_core.sql; do
  echo "==> $f"
  ssh "$DB" 'sudo docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1' < "$f" || { echo "ОШИБКА в $f — дальше не идём"; break; }
done
ssh "$DB" "sudo docker exec supabase-db psql -U supabase_admin -d postgres -c \"NOTIFY pgrst, 'reload schema';\""
```

Каждая миграция идёт в транзакции (`BEGIN … COMMIT`) — при ошибке ничего не применится наполовину. Последняя команда просит PostgREST сразу увидеть новые таблицы [Likely: обычно он обновляется сам].

### 3.3 Проверка

```bash
sudo docker exec supabase-db psql -U supabase_admin -d postgres -c "\dt public.trn_*" -c "\df public.record_table_tip"
```

Должны быть таблицы: `trn_dish_facts`, `trn_fact_audit_log`, `trn_enrollments`, `trn_invites`, `trn_members`, `trn_settings`, `trn_sessions`, `trn_attempts`, `trn_card_states`, `trn_member_state` и таблица `table_tips`.

### 3.4 Откат

Для каждой есть `…_rollback.sql` (в обратном порядке: 3, 2, 1). Откат **удаляет данные** этих таблиц без возврата.

## 4. Переменные окружения

Все — в одном файле `/opt/restai/Trainer-RestAI/.env.production` (так же, как у остальных приложений: `api-server.mjs` читает его при запуске, Vite — при сборке; в сборку попадают **только** переменные с префиксом `VITE_`, ключ сервиса туда не попадёт) [Certain]. Права: `chmod 600`.

| Переменная | Где используется | Что это и откуда взять |
|---|---|---|
| `VITE_SUPABASE_URL` | приложение (сборка) | Адрес Supabase. **То же значение**, что `VITE_SUPABASE_URL` в `/opt/restai/RestAI/.env.production`. |
| `VITE_SUPABASE_ANON_KEY` | приложение (сборка) | Публичный ключ **anon** — тот же, что в `RestAI/.env.production`. Он публичный по природе, секретом не является. |
| `VITE_API_URL` | приложение (сборка) | Адрес API тренажёра. **Оставьте пустым**, если приложение и API на одном домене (nginx проксирует `/api/`) — так в схеме ниже. |
| `SUPABASE_URL` | API (сервер) | То же значение, что `VITE_SUPABASE_URL`. |
| `SUPABASE_SERVICE_KEY` | API (сервер) | Ключ **service_role** из `.env` Supabase (`SERVICE_ROLE_KEY`) или тот же, что в `Waiter-app/.env.production` (`SUPABASE_SERVICE_KEY`). **Секрет**: даёт полный доступ к базе, только на сервере, никому не пересылать. |
| `TRAINER_PUBLIC_URL` | API (сервер) | Публичный адрес приложения без слэша в конце, например `https://trainer.restai.pro`. Сейчас нигде не обязателен (раньше из него строились ссылки приглашений). |
| `TRAINER_CORS_ORIGINS` | API (сервер) | Откуда разрешены запросы к API, через запятую: адрес админки (`https://admin.restai.pro`). Пусто — отовсюду (допустимо на старте). |
| `ADMIN_TOKEN` | API (сервер) | Общий токен для управления доступами в ресторанах кроме учебного. Сгенерировать: `openssl rand -hex 24`. |
| `TRAINER_ADMIN_OPEN_RESTAURANTS` | API (сервер) | Рестораны, где управление доступами **открыто без токена** (тестовый режим), id через запятую. **Строки нет в файле → открыта учебная «Сыроварня». Строка с пустым значением (`TRAINER_ADMIN_OPEN_RESTAURANTS=`) → закрыто всё**, коды выдаются только с `ADMIN_TOKEN`. Для боевого запуска — пустое значение. |

Для **админки** (`/opt/restai/Admin-restai/.env.production`, пересобрать после правки): `VITE_TRAINER_API_URL=https://<домен тренажёра>`.

Две оговорки:
- **Проверьте, что база одна.** В Waiter-app есть две пары переменных (`VITE_SUPABASE_URL` и `VITE_SUPABASE_WAITER_URL`). Тренажёру нужна база с таблицами `restaurants` и `menu_items` — по миграциям RestAI это та же база, что у официантов [Certain: связанные внешние ключи в одной БД], но убедитесь, что значения совпадают.
- `ADMIN_TOKEN` и тестовый режим: **токен нельзя вводить в админке у клиента** — он общий для всех ресторанов. До появления входа для администраторов выдавайте коды только сами.

## 5. Выкладка тренажёра на VPS

Скрипты лежат в репозитории RestAI (`deploy/`), там же, где установка остальных приложений: `setup-trainer.sh`, `nginx-trainer.conf.template`, а также строки для тренажёра в `update.sh`, `auto-update.sh`, `enable-https.sh`. Они повторяют `setup-admin.sh`; на вашем сервере их ещё не запускали (в песочнице с заглушками `sudo`/`nginx`/`pm2` проверены ключевые пути, см. ниже).

Один раз (после слияния веток в `main`, раздел 1):

```bash
git -C /opt/restai/RestAI pull          # подтянуть новые скрипты deploy/
# 1. DNS: A-запись trainer.restai.pro (или ваш домен) → IP этого сервера
# 2. Установка: создаёт deploy-ключ, клонирует репозиторий, собирает, поднимает API (pm2, порт 3003), настраивает nginx
TRAINER_DOMAIN=trainer.restai.pro bash /opt/restai/RestAI/deploy/setup-trainer.sh
```

Скрипт остановится дважды — это нормально:
1. **Не удалось склонировать** (репозиторий закрытый): он напечатает публичный ключ. Добавьте его в GitHub: Trainer-RestAI → Settings → Deploy keys → Add deploy key (**без** галочки «Allow write access») и запустите скрипт снова.
2. **Создан `.env.production`**: заполните его (раздел 4) и запустите снова. Скрипт проверит обязательные значения и откажется продолжать, если что-то пусто или осталось в виде `<…>`.

Дальше:

```bash
# 3. HTTPS — только после того, как DNS указывает на сервер
EMAIL=<почта> TRAINER_DOMAIN=trainer.restai.pro bash /opt/restai/RestAI/deploy/enable-https.sh trainer
# 4. Автообновление (если ещё не ставили): раз в 2 минуты смотрит main и выкладывает новое
bash /opt/restai/RestAI/deploy/auto-update.sh install
```

Вручную обновить сразу: `bash /opt/restai/RestAI/deploy/update.sh trainer`.

Проверка (скрипт печатает её сам в конце):
```bash
curl -fsS http://127.0.0.1:3003/api/__health          # {"ok":true,"routes":[…/api/me,/api/session,…]}
curl -s -o /dev/null -w '%{http_code}\n' https://trainer.restai.pro/            # 200
curl -s https://trainer.restai.pro/mail/magic_link.html | grep -c 'Token'       # 1 — Supabase заберёт шаблон
```

**Ограничения:** [Certain]
- Скрипты проверены в песочнице: настоящие `bash`, `git`, `npm`, `api-server.mjs`, но заглушки `sudo`, `nginx`, `pm2`. Не проверено на вашем сервере: `nginx -t` на вашей конфигурации, реальный `pm2`, `certbot`, клон по deploy-ключу из GitHub. Перед первым запуском посмотрите скрипт и после — `sudo nginx -t`.
- Миграции базы автообновление **не запускает** (как и для остальных приложений): их применяют вручную (раздел 3).
- Запускайте API **одним** процессом pm2: лимит попыток входа хранится в памяти процесса.

## 5б. Демо-вход для показа ресторанам

Код, по которому можно войти в тренажёр учебного ресторана «Сыроварня» без почты и регистрации. Каждый вход получает **отдельный чистый аккаунт** (двое гостей показа не мешают друг другу); аккаунты удаляются через сутки; в списке официантов админки их нет. Демо-вход **выключен**, пока не задан код.

1. Придумайте цифровой код (для автоматического входа — ровно 4 цифры) и добавьте в `/opt/restai/Trainer-RestAI/.env.production` строку `TRAINER_DEMO_CODE=<код>`. Перезапустите API: `pm2 reload restai-trainer-api --update-env`.
2. Подготовьте демо-данные: `node /opt/restai/Trainer-RestAI/scripts/demo-seed.mjs`. Скрипт через API контент-студии подтверждает состав блюд, безалкогольных напитков и коктейлей «Сыроварни» (ключевые — первые пять ингредиентов), а у вин — сорт винограда и год урожая, чтобы работал уровень 2 «Состав и вина». Предварительно примените на БАЗЕ миграцию `20261105010000_trainer_wine_facts.sql` (RestAI) и дождитесь деплоя Waiter-app. Посмотреть, что будет обработано, не меняя данных: `node /opt/restai/Trainer-RestAI/scripts/demo-seed.mjs --explain`. Это **демо-данные, а не проверка шефа**: в журнале подтверждений пишется «Демо (автоматически)». Скрипт работает только с учебным рестораном и безопасен при повторном запуске.
3. На экране входа нажмите «Посмотреть демо» и введите код: четыре цифры вводятся без кнопки (вход срабатывает на четвёртой). Для простого показа задайте `TRAINER_DEMO_CODE=1234`.

Ограничения: код один на всех и не рассчитан на защиту реальных данных: демо-аккаунты видят только меню учебного ресторана. Попыток ввода кода не больше 10 за 10 минут с одного адреса.

## 6. Приёмка: пройти путь целиком

1. В админке («Обучение → Доступы») внесите **настоящую** почту, к которой у вас есть доступ, с именем.
2. С телефона откройте тренажёр, введите эту почту → должно прийти письмо **с кодом** (не ссылкой) → введите → главный экран, статус в админке станет «Идёт курс».
3. Выйти → «Вход» → та же почта → новый код → вход.
4. Закройте доступ в админке → повторный вход после кода: «Доступ к курсу закончился».
5. Чужая почта на экране «Вход»: экран кода открывается, но письма нет; почта, которой нет в списке, но есть в Supabase (например, из Waiter-app): после кода «Вашей почты нет в списке доступа».
6. Дальше нужны данные: в контент-студии подтвердите состав хотя бы нескольких блюд и напитков (отметьте ключевые ингредиенты), а у вин — сорт винограда и год урожая; иначе уровень 2 будет пуст.

[Certain] Шаги 2–3 с **настоящим Supabase и почтой** я не проверял: в моих проверках был тестовый сервер с заглушкой отправки письма. Именно здесь возможны расхождения (формат ошибок, тип письма для новых пользователей).

## 7. Если что-то не так

| Симптом | Вероятная причина |
|---|---|
| Письмо не приходит | SMTP не настроен/неверный пароль (`docker logs supabase-auth`); письмо в спаме; превышен `GOTRUE_RATE_LIMIT_EMAIL_SENT` |
| Пришла ссылка, а не код | не подхватился шаблон: адрес `…/mail/…` недоступен с сервера Supabase, опечатка в `GOTRUE_MAILER_TEMPLATES_*`, или настроен только один из двух шаблонов |
| Код не приходит у почты из списка | пользователь не заведён: при добавлении в админке появилась ошибка (см. `pm2 logs restai-trainer-api`), либо почта набрана с опечаткой |
| «Нет доступа» после входа | почты нет в списке доступов, либо доступ закрыт, либо аккаунт привязан к другому ресторану (текст причины показан на экране) |
| Главная пустая: «Меню ещё не готово» | шеф не подтвердил факты; сначала контент-студия |
| Ошибка 500 на `/api/me` | не применена миграция 3 или не тот `SUPABASE_URL`/ключ (`pm2 logs restai-trainer-api`) |
