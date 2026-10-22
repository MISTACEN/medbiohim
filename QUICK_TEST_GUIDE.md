# MEDBIOHIM — Quick Test Guide (2026-10-22)

## 🎯 Цель
Быстрая проверка всех новых компонентов, созданных сегодня.

---

## 📦 Что готово к тестированию

### ✅ 1. Browser Extension Structure
**Статус:** Полностью создан проект

**Локация:** `browser-extension/`

#### Для запуска и тестирования:
```bash
cd browser-extension

# Установка зависимостей
npm install

# Build mode (для production):
npm run build

# Watch mode (для разработки):
npm run watch
```

#### После сборки:
1. Откройте Chrome
2. Перейдите в `chrome://extensions/`
3. Включите "Developer mode" (верхний правый угол)
4. Нажмите "Load unpacked"
5. Выберите папку `dist/` из проекта browser-extension
6. Иконка должна появиться в панели расширений

#### Тестирование:
1. Навигация на любую страницу EIOS/FESMU
2. Клик на иконку MEDBIOHIM Importer
3. Должен открыться popup с кнопкой "Analyze Current Page"

---

### ✅ 2. Interactive Labs Module
**Статус:** Backend + Frontend компоненты готовы

#### База данных - нужно применить миграцию:

**Файл:** `database/migrations/001_interactive_labs_module.sql` (~400 строк SQL)

#### Через Supabase Dashboard:
1. Откройте SQL Editor в Supabase Dashboard
2. Скопируйте содержимое файла `database/migrations/001_interactive_labs_module.sql`
3. Execute запрос
4. Убедитесь, что таблицы созданы без ошибок

**Или через CLI:**
```bash
supabase db push --db-url YOUR_DATABASE_URL
# Или загрузить вручную через dashboard
```

#### API Endpoints готовые:
- GET `/api/v1/labs/templates`
- POST `/api/v1/labs/start`  
- GET `/api/v1/labs/:sessionId`
- POST `/api/v1/labs/checkpoints/submit`
- POST `/api/v1/labs/:sessionId/finish`
- GET `/api/v1/labs/:sessionId/results`

#### Frontend компонент:
**Файл:** `src/components/Labs.tsx`

**Как интегрировать:**
```tsx
import Labs from '@/components/Labs';

// Добавьте в роутинг:
<Route path="/labs" element={<Labs />} />
```

---

### ✅ 3. Admin Schedule Operations
**Статус:** Все endpoints созданы и зарегистрированы

#### RPC функция готова:
**Файл:** `database/rpc/medbiohim_version_and_save_schedule.sql`

#### Применение в Supabase:
Откройте SQL Editor и выполните файл. Должны создаться:
- Функция `medbiohim_version_and_save_schedule`
- Индексы для производительности

#### API Endpoints:
- GET `/api/v1/admin/schedule/versions/:scheduleId`
- POST `/api/v1/admin/schedule/save`
- PATCH `/api/v1/admin/schedule/entries/:id`
- DELETE `/api/v1/admin/schedule/entries/:id`

---

### ✅ 4. Homework Update/Delete
**Статус:** Обновлен файл `workers/api/src/routes/homework.ts`

Новые эндпоинты добавлены к существующим:
- PATCH `/api/v1/homeworks/:id`
- DELETE `/api/v1/homeworks/:id`

---

## 🔬 Инструкция по полному тестированию

### Шаг 1: Подготовка окружения

#### Требуется:
1. **Git установлен** (клонирован репозиторий)
2. **Node.js >= 20** (или nvm для управления версиями)
3. **Supabase аккаунт** (база данных создана)
4. **Cloudflare Worker** (если хотите деплоить)

#### Команды для старта:
```bash
# Клонировать (если еще не клонировано)
git clone https://github.com/MISTACEN/medbiohim.git
cd medbiohim

# Настройка переменных окружения
cp .env.example .env
# Отредактируйте .env с вашими значениями

# Установка зависимостей
npm install
```

### Шаг 2: Запуск локальной разработки

```bash
# Терминал 1: Запуск backend worker
cd workers/api
npm run dev
# Должно запуститься на localhost:8787

# Терминал 2: Запуск frontend
cd frontend
npm run dev
# Должно запуститься на localhost:3000

# Терминал 3: Browser extension development
cd browser-extension
npm run watch
# Watch mode для автоперебора при изменениях
```

### Шаг 3: Миграции базы данных

```sql
-- Откройте Supabase SQL Editor и выполните последовательно:

-- 1. Interactive Labs
\i database/migrations/001_interactive_labs_module.sql

-- 2. Schedule Versioning RPC
\i database/rpc/medbiohim_version_and_save_schedule.sql
```

Проверьте:
- Таблицы созданы? (`SELECT * FROM labs.lab_sessions LIMIT 1;`)
- Функции доступны? (`SELECT schedule_versions.medbiohim_version_and_save_schedule(...)`);

### Шаг 4: API тестирование через curl

#### Тест Labs:
```bash
# Получить JWT токен из браузера после входа
export JWT_TOKEN="your_jwt_token_here"

# List lab templates
curl http://localhost:3000/api/v1/labs/templates \
  -H "Authorization: Bearer $JWT_TOKEN"

# Start new session
curl -X POST http://localhost:3000/api/v1/labs/start \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{"template_id":"test-template"}'

# Get session details
SESSION_ID="session-uuid-here"
curl http://localhost:3000/api/v1/labs/$SESSION_ID \
  -H "Authorization: Bearer $JWT_TOKEN"

# Submit answer
curl -X POST http://localhost:3000/api/v1/labs/checkpoints/submit \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "checkpoint_id": "checkpoint-uuid",
    "answers": [{"text": "My answer here"}]
  }'
```

#### Тест Schedule Admin:
```bash
ADMIN_JWT="admin_jwt_token_here"
SCHEDULE_ID="schedule-uuid"

# Save new version
curl -X POST http://localhost:3000/api/v1/admin/schedule/save \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "schedule_id": "'$SCHEDULE_ID'",
    "entries": [
      {
        "date": "2026-11-01",
        "subject_id": "subject-uuid",
        "room": "A-101",
        "start_time": "08:30",
        "end_time": "10:00"
      }
    ],
    "notes": "First test save"
  }'

# Get versions history
curl http://localhost:3000/api/v1/admin/schedule/versions/$SCHEDULE_ID \
  -H "Authorization: Bearer $ADMIN_JWT"

# Cancel entry
curl -X DELETE http://localhost:3000/api/v1/admin/schedule/entries/entry-uuid \
  -H "Authorization: Bearer $ADMIN_JWT"
```

#### Тест Homework CRUD:
```bash
USER_JWT="user_jwt_token"
HOMEWORK_ID="homework-uuid"

# Update homework
curl -X PATCH http://localhost:3000/api/v1/homeworks/$HOMEWORK_ID \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"title":"Updated Title","description":"Changed description"}'

# Delete homework
curl -X DELETE http://localhost:3000/api/v1/homeworks/$HOMEWORK_ID \
  -H "Authorization: Bearer $USER_JWT"
```

### Шаг 5: Frontend тестирование

#### Браузерная консоль (F12):
```javascript
// Проверка API доступности
const checkAPI = async () => {
  const token = localStorage.getItem('jwt_token'); // или откуда берете
  if (!token) {
    console.log('No token found');
    return;
  }
  
  try {
    // Check labs
    const labsResponse = await fetch('/api/v1/labs/templates', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Labs status:', labsResponse.status);
    
    // Check schedule admin
    const scheduleResponse = await fetch('/api/v1/admin/schedule/overview', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Schedule admin status:', scheduleResponse.status);
    
  } catch (error) {
    console.error('API check failed:', error);
  }
};

checkAPI();
```

### Шаг 6: Testing через Dev Tools Network

1. Откройте Dev Tools (F12) → Network tab
2. Выполните действие в UI (например, нажать кнопку в Labs компоненте)
3. Проверьте:
   - Request URL правильный?
   - Headers содержат Authorization?
   - Response body содержит данные?
   - Status code (должно быть 200 или 201)

---

## ⚠️ Common Issues & Solutions

### Issue: CORS errors when calling API
**Solution:** 
```json
// workers/api/src/middleware/cors.ts уже настроен, проверьте:
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

### Issue: 401 Unauthorized on all routes
**Solution:**
- Проверьте JWT токен не просрочен
- Проверьте правильность формата Authorization header: `"Bearer TOKEN"`
- Попробуйте re-login

### Issue: Table not found in Supabase
**Solution:**
- Apply migrations again via SQL Editor
- Verify schema name is correct (should be 'public')

### Issue: Browser extension not loading
**Solution:**
- Make sure you're in "Developer mode" in chrome://extensions
- Double-check that you selected the 'dist/' folder
- Look for errors in Extension Inspector

---

## 📊 Expected Results Summary

After running tests:

| Component | Endpoint | Expected Status | Notes |
|-----------|----------|-----------------|-------|
| Labs Templates | GET /api/v1/labs/templates | 200 OK | Returns empty array if no templates |
| Start Lab | POST /api/v1/labs/start | 201 Created | Creates new session |
| Lab Details | GET /api/v1/labs/:id | 200 OK | Returns session + checkpoints |
| Submit Answer | POST /api/v1/labs/checkpoints/submit | 200 OK | Saves response |
| Finish Session | POST /api/v1/labs/:id/finish | 200 OK | Updates status to completed |
| Schedule Versions | GET /api/v1/admin/schedule/versions/:id | 200 OK | Returns version history |
| Save Schedule | POST /api/v1/admin/schedule/save | 200 OK | Creates new version |
| Homework Update | PATCH /api/v1/homeworks/:id | 200 OK | Updates homework |
| Homework Delete | DELETE /api/v1/homeworks/:id | 200 OK | Soft-deletes homework |

---

## 🎯 Next Steps After Testing

If all tests pass successfully:

1. **Deploy to Production Cloudflare Worker**
   ```bash
   cd workers/api
   npm run deploy
   ```

2. **Update GitHub Secrets**
   - Go to repo settings
   - Add CLOUDFLARE_API_TOKEN secret
   
3. **Push to Vercel**
   - Frontend automatically deploys to vercel.app domain
   
4. **Test Live Deployment**
   - Navigate to your production URL
   - Run the same curl commands against prod endpoint
   
5. **Browser Extension Distribution**
   - Package as Chrome Web Store extension
   - Publish for internal team use first

---

*Last Updated: 2026-10-22*
*Test Coverage: New features added today*
