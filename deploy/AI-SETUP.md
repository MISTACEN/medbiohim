# AI-тьютор — как настроено (без ошибок)

## Правильные вызовы (проверено 2026-10-02)

### Gemini
- Endpoint: `POST .../v1beta/models/{model}:generateContent`
- Header: `x-goog-api-key: $GEMINI_API_KEY`
- Mode: `GEMINI_API_MODE=generate_content` (не interactions по умолчанию)
- Актуальная модель в env: **gemini-3.8-flash** (gemini-2.0-flash уже снят с API)

### Groq
- OpenAI-compatible: `$GROQ_BASE_URL/chat/completions`
- Рабочая модель: **openai/gpt-oss-20b** (llama-3.3-70b на этом ключе давал 404)

### GigaChat
- OAuth: `https://ngw.devices.sberbank.ru:9443/api/v2/oauth` + Basic credentials
- Chat: `https://gigachat.devices.sberbank.ru/api/v1/chat/completions`
- `GIGACHAT_VERIFY_SSL=0` — сертификат Sber
- Scope: `GIGACHAT_API_PERS`

## Код
- `LlmGateway` — multi-provider + auto fallback
- `AiChatService` — чаты в Supabase `ai_conversations` / `ai_messages`
- `AiChatService` + `LlmGateway` — основной AI-тьютор и чаты
- UI: `/tutor`
- Старый `TutorService`/`/api/v1/tutor/*` удалены как неиспользуемый legacy API.

## Env на SpaceWeb
Скопируй блок LLM/B2 из `backend/.env` (ключи уже есть локально).
