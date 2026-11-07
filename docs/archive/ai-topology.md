# AI topology: РФ / VPN / SpaceWeb / внешние модели

## Профили доступа

| Студент | Медиа | ИИ |
| --- | --- | --- |
| РФ без VPN | RuTube, VK, Яндекс первыми | PRIMARY или локальные шаблоны SpaceWeb |
| РФ с VPN / abroad | + YouTube | PRIMARY → GLOBAL |

VPN в браузере влияет на **просмотр YouTube**, не на серверный вызов LLM.

## Где что крутится

- **SpaceWeb**: RAG, калькуляторы, SRS, шаблоны лекций (тяжёлые модели нельзя)
- **PRIMARY**: VPS в РФ / YandexGPT / GigaChat / Ollama (OpenAI-compatible `/v1`)
- **GLOBAL**: OpenAI и аналоги (опционально)

## Env

```env
LLM_MODE=hybrid
LLM_ALLOW_GLOBAL=1
MEDIA_REGION_DEFAULT=ru
LLM_PRIMARY_BASE_URL=https://YOUR-RF-AI/v1
LLM_PRIMARY_API_KEY=
LLM_PRIMARY_MODEL=
LLM_GLOBAL_BASE_URL=https://api.openai.com/v1
LLM_GLOBAL_API_KEY=
LLM_GLOBAL_MODEL=gpt-4o-mini
```

`LLM_MODE=local` — только RAG/шаблоны.

Код: `Medbiohim\\Support\\LlmGateway`. Health: блок `llm`.
