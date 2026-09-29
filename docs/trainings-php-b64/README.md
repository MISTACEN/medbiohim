# trainings.php (full fixed) as base64

Assemble:
```bash
cat docs/trainings-php-b64/part*.txt | tr -d '\n' | base64 -d > trainings.php
```

Then copy to:
- spaceweb_upload/config/routes/trainings.php
- backend/config/routes/trainings.php

Contains: force start, correctSql boolean literals, early complete (is_skipped).
Parts: 4, raw bytes: 20262
