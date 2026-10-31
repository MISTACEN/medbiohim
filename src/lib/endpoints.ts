/**
 * Единый реестр путей same-origin API (TECH-AUDIT-PLAN-2026-10-27 §6, D4).
 *
 * Каждый строковый путь `/api/v1`-прокси живёт здесь и только здесь:
 * клиентские модули (`src/lib/api/*`, а также `settings-api.ts`,
 * `content-api.ts`, `features-api.ts`) вызывают билдеры, а не пишут пути.
 *
 * - статические пути — функции без аргументов: `endpoints.auth.login()`;
 * - динамические сегменты — билдеры с `encodeURIComponent`;
 * - query-строки приходят готовыми (`URLSearchParams.toString()`), билдер
 *   только добавляет `?`.
 *
 * Файл не имеет импортов и использует только стираемый синтаксис TS,
 * поэтому контрактный тест `test/endpoints-registry.test.mjs` может
 * импортировать его напрямую из `node --test`.
 */

/** База same-origin прокси (src/app/api/v1/[...path]/route.ts). */
export const API_URL: string = "/api/v1";

const enc = encodeURIComponent;
const withQuery = (path: string, query?: string): string => (query ? `${path}?${query}` : path);

export const endpoints = {
  /** Аутентификация и сессия. */
  auth: {
    login: (): string => "/auth/login",
    register: (): string => "/auth/register",
    recover: (): string => "/auth/recover",
    me: (): string => "/auth/me",
    logout: (): string => "/auth/logout",
    refresh: (): string => "/auth/refresh",
    telegramWebApp: (): string => "/auth/telegram/webapp",
    // Website "Sign in with Telegram" (Login Widget): public config for the widget
    // and the login endpoint that accepts its signed callback payload.
    telegramWidgetConfig: (): string => "/auth/telegram/config",
    telegramWidgetLogin: (): string => "/auth/telegram/widget",
    // Cookie-транспорт (RFC docs/COOKIES-RFC-E1.md §3.2): это не пути прокси
    // /api/v1, а route handlers Next, ставящие/чистящие HttpOnly-куки.
    sessionCookie: (): string => "/api/auth/session",
    logoutCookie: (): string => "/api/auth/logout",
  },

  /** Предметы, группы, темы, учебный план. */
  subjects: {
    list: (query?: string): string => withQuery("/subjects", query),
    detail: (id: string): string => `/subjects/${enc(id)}`,
    planProgress: (id: string): string => `/subjects/${enc(id)}/plan-progress`,
    gradebook: (id: string): string => `/subjects/${enc(id)}/gradebook`,
    catalog: (): string => "/subjects-catalog",
    subjectPlan: (slug: string, query?: string): string => withQuery(`/subject-plans/${enc(slug)}`, query),
    topicProgress: (topicId: string): string => `/topics/${enc(topicId)}/progress`,
    curriculum: (): string => "/curriculum",
    groups: (query?: string): string => withQuery("/groups", query),
    groupDetail: (id: string): string => `/groups/${enc(id)}`,
    groupMembers: (id: string): string => `/groups/${enc(id)}/members`,
    groupMember: (id: string, userId: string): string => `/groups/${enc(id)}/members/${enc(userId)}`,
  },

  /** Тесты, попытки, подготовка, билеты, экзаменационные вопросы. */
  tests: {
    list: (query?: string): string => withQuery("/tests", query),
    detail: (id: string, query?: string): string => withQuery(`/tests/${enc(id)}`, query),
    chemistryMaster: (query?: string): string => withQuery("/tests/chemistry-master", query),
    curriculumMap: (query?: string): string => withQuery("/tests/curriculum-map", query),
    start: (id: string, query?: string): string => withQuery(`/tests/${enc(id)}/start`, query),
    bankProgress: (id: string, query?: string): string => withQuery(`/tests/${enc(id)}/bank-progress`, query),
    preparationStart: (id: string): string => `/tests/${enc(id)}/preparation/start`,
    attemptsAnswers: (attemptId: string): string => `/tests/attempts/${enc(attemptId)}/answers`,
    attemptsAnswerRegrade: (attemptId: string, questionId: string): string =>
      `/tests/attempts/${enc(attemptId)}/answers/${enc(questionId)}/regrade`,
    attemptsFinish: (attemptId: string): string => `/tests/attempts/${enc(attemptId)}/finish`,
    myAttempts: (query?: string): string => withQuery("/my/attempts", query),
    preparation: (sessionId: string): string => `/tests/preparation/${enc(sessionId)}`,
    preparationFinish: (sessionId: string): string => `/tests/preparation/${enc(sessionId)}/finish`,
    preparationAiReview: (sessionId: string): string => `/tests/preparation/${enc(sessionId)}/ai-review`,
    preparationRetryGrading: (sessionId: string): string => `/tests/preparation/${enc(sessionId)}/retry-grading`,
    ticketsGenerate: (): string => "/tickets/generate",
    ticketBanks: (): string => "/tickets/banks",
    examQuestions: (): string => "/exam-questions",
    examQuestionsSummary: (): string => "/exam-questions/summary",
  },

  /** Расписание, посещаемость, планировщик, iCal. */
  schedule: {
    list: (query?: string): string => withQuery("/schedule", query),
    meta: (query?: string): string => withQuery("/schedule/meta", query),
    feedLink: (): string => "/schedule/feed-link",
    ical: (query?: string): string => withQuery("/schedule/ical", query),
    icalEvent: (id: string): string => `/schedule/ical/${enc(id)}`,
    attendance: (entryId: string, query?: string): string => withQuery(`/attendance/${enc(entryId)}`, query),
    planner: (query?: string): string => withQuery("/planner", query),
  },

  /** Домашние задания и личные задания. */
  homeworks: {
    list: (query?: string): string => withQuery("/homeworks", query),
    smartParse: (): string => "/homeworks/smart-parse",
    progress: (id: string): string => `/homeworks/${enc(id)}/progress`,
    submit: (id: string): string => `/homeworks/${enc(id)}/submit`,
    submissions: (id: string): string => `/homeworks/${enc(id)}/submissions`,
    assignments: (query?: string): string => withQuery("/assignments", query),
    assignment: (id: string): string => `/assignments/${enc(id)}`,
  },

  /** Контент: материалы, лекции, вопросы, тренажёры, гистология, аттестации. */
  content: {
    materials: (query?: string): string => withQuery("/materials", query),
    materialFileUrl: (id: string): string => `/materials/${enc(id)}/file-url`,
    materialFile: (id: string): string => `/materials/${enc(id)}/file`,
    materialOpen: (id: string): string => `/materials/${enc(id)}/open`,
    lectures: (query?: string): string => withQuery("/lectures", query),
    lecture: (id: string): string => `/lectures/${enc(id)}`,
    subjectMaterials: (query?: string): string => withQuery("/subject-materials", query),
    contentSource: (id: string): string => `/content-sources/${enc(id)}`,
    histologySourceFile: (): string => "/histology/source-file",
    histologySourceMaterials: (): string => "/histology/source-materials",
    trainings: (query?: string): string => withQuery("/trainings", query),
    training: (id: string): string => `/trainings/${enc(id)}`,
    trainingAnswer: (id: string): string => `/trainings/${enc(id)}/answer`,
    trainingComplete: (id: string): string => `/trainings/${enc(id)}/complete`,
    trainingCancel: (id: string): string => `/trainings/${enc(id)}/cancel`,
    questions: (query?: string): string => withQuery("/questions", query),
    question: (id: string): string => `/questions/${enc(id)}`,
    questionReport: (id: string): string => `/questions/${enc(id)}/report`,
    questionComments: (questionId: string): string => `/questions/${enc(questionId)}/comments`,
    questionComment: (commentId: string): string => `/questions/comments/${enc(commentId)}`,
    questionsSubjects: (): string => "/questions/subjects",
    questionTopics: (query?: string): string => withQuery("/questions/topics", query),
    miniQuiz: (): string => "/questions/mini-quiz",
    miniQuizCheck: (): string => "/questions/mini-quiz/check",
    trainersFeed: (query?: string): string => withQuery("/trainers/feed", query),
    trainerFeedCard: (id: string): string => `/trainers/feed/${enc(id)}`,
    trainerFeedImage: (id: string): string => `/trainers/feed/${enc(id)}/image`,
    /** Метка для журнала `mbh:api-log` (не путь запроса, но живёт в реестре). */
    trainerFeedImageLabel: (): string => "/trainers/feed/:id/image",
    trainerFeedStats: (): string => "/trainers/feed/stats",
    trainerFeedAnswer: (): string => "/trainers/feed/answer",
    attestations: (query?: string): string => withQuery("/attestations", query),
    attestation: (subjectSlug: string, slug: string): string => `/attestations/${enc(subjectSlug)}/${enc(slug)}`,
    lessonPlan: (query?: string): string => withQuery("/lesson-plan", query),
  },

  /** Сообщество. */
  community: {
    posts: (query?: string): string => withQuery("/community/posts", query),
    post: (postId: string): string => `/community/posts/${enc(postId)}`,
    postComments: (postId: string): string => `/community/posts/${enc(postId)}/comments`,
    postComment: (postId: string, commentId: string): string =>
      `/community/posts/${enc(postId)}/comments/${enc(commentId)}`,
    postReport: (postId: string): string => `/community/posts/${enc(postId)}/report`,
    adminReports: (): string => "/community/admin/reports",
    adminReport: (id: string): string => `/community/admin/reports/${enc(id)}`,
  },

  /** Мастерская: общий пул студенческих материалов и модерация. */
  workshop: {
    settings: (): string => "/workshop/settings",
    suggest: (): string => "/workshop/suggest",
    items: (query?: string): string => withQuery("/workshop/items", query),
    item: (id: string): string => `/workshop/items/${enc(id)}`,
    itemVisibility: (id: string): string => `/workshop/items/${enc(id)}/visibility`,
    itemVersions: (id: string): string => `/workshop/items/${enc(id)}/versions`,
    itemRestore: (id: string, versionNo: number | string): string =>
      `/workshop/items/${enc(id)}/versions/${enc(String(versionNo))}/restore`,
    itemReport: (id: string): string => `/workshop/items/${enc(id)}/report`,
    itemFile: (id: string, fileId: string): string =>
      `/workshop/items/${enc(id)}/files/${enc(fileId)}`,
    moderationQueue: (): string => "/workshop/moderation/queue",
    moderationItem: (id: string): string => `/workshop/moderation/items/${enc(id)}`,
    moderationReports: (): string => "/workshop/moderation/reports",
    moderationReport: (id: string): string => `/workshop/moderation/reports/${enc(id)}`,
  },

  /** Роли, запросы старост, быстрые фиксы и уведомления. */
  staff: {
    capabilities: (): string => "/staff/capabilities",
    groupManage: (id: string): string => `/staff/groups/${enc(id)}/manage`,
    group: (id: string): string => `/staff/groups/${enc(id)}`,
    groupMember: (groupId: string, userId: string): string =>
      `/staff/groups/${enc(groupId)}/members/${enc(userId)}`,
    groupHomework: (groupId: string, homeworkId: string): string =>
      `/staff/groups/${enc(groupId)}/homeworks/${enc(homeworkId)}`,
    joinRequests: (groupId: string): string => `/staff/groups/${enc(groupId)}/join-requests`,
    joinRequest: (groupId: string, requestId: string): string =>
      `/staff/groups/${enc(groupId)}/join-requests/${enc(requestId)}`,
    requests: (query?: string): string => withQuery("/staff/requests", query),
    request: (id: string): string => `/staff/requests/${enc(id)}`,
    fixesPreview: (): string => "/staff/fixes/preview",
    fixesApply: (): string => "/staff/fixes/apply",
    fixes: (): string => "/staff/fixes",
    fixRevert: (id: string): string => `/staff/fixes/${enc(id)}/revert`,
    topicsMerge: (): string => "/staff/topics/merge",
    notifications: (): string => "/staff/notifications",
    notificationsRead: (): string => "/staff/notifications/read",
  },

  /** Файлы, аватары, blob-отдача. */
  files: {
    upload: (): string => "/files/upload",
    file: (id: string): string => `/files/${enc(id)}`,
    fileDownload: (id: string): string => `/files/${enc(id)}/download`,
    avatar: (): string => "/storage/avatar",
    avatarDetail: (userId: string): string => `/storage/avatar/${enc(userId)}`,
  },

  /** Админ-панель. */
  admin: {
    presence: (within: string | number): string => `/admin/presence?within=${enc(String(within))}`,
    overview: (): string => "/admin/overview",
    site: (): string => "/admin/site",
    users: (query?: string): string => withQuery("/admin/users", query),
    userRoles: (): string => "/admin/users/roles",
    databaseConnections: (): string => "/admin/database/connections",
    databaseConnection: (id: string): string => `/admin/database/connections/${enc(id)}`,
    databaseConnectionTest: (id: string): string => `/admin/database/connections/${enc(id)}/test`,
    databaseTables: (dbId: string): string => `/admin/database/${enc(dbId)}/tables`,
    databaseSchema: (dbId: string, table: string): string => `/admin/database/${enc(dbId)}/schema/${enc(table)}`,
    databaseRows: (dbId: string, table: string, query?: string): string =>
      withQuery(`/admin/database/${enc(dbId)}/rows/${enc(table)}`, query),
    databaseSql: (dbId: string): string => `/admin/database/${enc(dbId)}/sql`,
    dbAudit: (query?: string): string => withQuery("/admin/db/audit", query),
    dbAuditVersion: (id: string): string => `/admin/db/audit/${enc(id)}`,
    dbAuditRollback: (id: string): string => `/admin/db/audit/${enc(id)}/rollback`,
    buildTestVariants: (): string => "/admin/tests/build-variants",
    telegramChats: (): string => "/admin/telegram/chats",
    telegramChatBind: (chatId: string | number): string => `/admin/telegram/chats/${enc(String(chatId))}/bind`,
    telegramSetWebhook: (): string => "/admin/telegram/set-webhook",
    telegramAiStatus: (): string => "/admin/telegram/ai-status",
    telegramMessages: (query?: string): string => withQuery("/admin/telegram/messages", query),
    telegramMessagePublish: (id: string): string => `/admin/telegram/messages/${enc(id)}/publish`,
    contentArchive: (): string => "/admin/content/archive",
    contentMove: (): string => "/admin/content/move",
    contentImport: (): string => "/admin/content/import",
    contentPackageImport: (): string => "/admin/content/package/import",
    contentValidate: (): string => "/admin/content/validate",
    announcements: (): string => "/admin/announcements",
    announcement: (id: string): string => `/admin/announcements/${enc(id)}`,
    community: (): string => "/admin/community",
    communityDetail: (id: string): string => `/admin/community/${enc(id)}`,
    homeworks: (): string => "/admin/homeworks",
    homework: (id: string): string => `/admin/homeworks/${enc(id)}`,
    questions: (query?: string): string => withQuery("/admin/questions", query),
    question: (id: string): string => `/admin/questions/${enc(id)}`,
    questionBank: (id: string): string => `/admin/question-bank/${enc(id)}`,
    questionReport: (id: string): string => `/admin/question-reports/${enc(id)}`,
    problemCenter: (): string => "/admin/problem-center",
    problemCenterWork: (): string => "/admin/problem-center/work",
    problemCenterWorkDetail: (id: string): string => `/admin/problem-center/work/${enc(id)}`,
    lectures: (query?: string): string => withQuery("/admin/lectures", query),
    lecture: (id: string): string => `/admin/lectures/${enc(id)}`,
    lectureGenerate: (): string => "/admin/lectures/generate",
    lecturePublish: (id: string): string => `/admin/lectures/${enc(id)}/publish`,
    lectureReject: (id: string): string => `/admin/lectures/${enc(id)}/reject`,
    materials: (): string => "/admin/materials",
    material: (id: string): string => `/admin/materials/${enc(id)}`,
    schedule: (): string => "/admin/schedule",
    scheduleImport: (): string => "/admin/schedule/import",
    // Резолвер когорты (Блок 5): «МБХ 201» → стабильная группа по году поступления.
    scheduleResolveGroup: (label: string): string => withQuery("/admin/schedule/resolve-group", "label=" + encodeURIComponent(label)),
    importCurriculum: (): string => "/admin/import/curriculum",
    filesAudit: (query?: string): string => withQuery("/admin/files/audit", query),
    filesCapabilities: (): string => "/admin/files/capabilities",
    attestations: (query?: string): string => withQuery("/admin/attestations", query),
    attestation: (subjectSlug: string, slug: string): string => `/admin/attestations/${enc(subjectSlug)}/${enc(slug)}`,
  },

  /** Системные/смешанные: здоровье, присутствие, дашборд, прогресс, academic, заметки. */
  misc: {
    health: (): string => "/health",
    presenceHeartbeat: (): string => "/presence/heartbeat",
    dashboard: (): string => "/dashboard",
    progress: (query?: string): string => withQuery("/progress", query),
    progressSummary: (): string => "/progress/summary",
    academicState: (): string => "/academic/state",
    academicSync: (): string => "/academic/sync",
    academicAiPlan: (): string => "/academic/ai-plan",
    notes: (): string => "/notes",
    note: (id: string): string => `/notes/${enc(id)}`,
    favorites: (): string => "/favorites",
    favoritesToggle: (): string => "/favorites/toggle",
    integrationImports: (): string => "/integrations/imports",
    integrationImport: (id: string): string => `/integrations/imports/${enc(id)}`,
    externalPlatformClick: (): string => "/external-platforms/click",
    externalPlatformStats: (): string => "/external-platforms/stats",
  },

  /** Настройки аккаунта (клиент src/lib/settings-api.ts). */
  settings: {
    account: (): string => "/settings/account",
    profile: (): string => "/settings/profile",
    emailResend: (): string => "/settings/email/resend",
    password: (): string => "/settings/password",
    identitiesLink: (): string => "/settings/identities/link",
    identitiesUnlink: (): string => "/settings/identities/unlink",
    preferences: (): string => "/settings/preferences",
    telegramLinkStart: (): string => "/settings/telegram/link-start",
    telegramStatus: (): string => "/settings/telegram/status",
    telegramUnlink: (): string => "/settings/telegram/unlink",
    sessions: (): string => "/settings/sessions",
    sessionsRevokeOthers: (): string => "/settings/sessions/revoke-others",
  },

  /** Утилиты/поиск/SRS/AI/аккаунт (клиент src/lib/features-api.ts). */
  features: {
    search: (query?: string): string => withQuery("/search", query),
    searchSuggest: (query?: string): string => withQuery("/search/suggest", query),
    calculators: (): string => "/calculators",
    calculatorCompute: (id: string): string => `/calculators/${enc(id)}/compute`,
    srsSummary: (): string => "/srs/summary",
    srsEnsure: (): string => "/srs/ensure",
    srsDue: (query: string): string => `/srs/due?${query}`,
    srsReview: (): string => "/srs/review",
    srsCards: (query?: string): string => withQuery("/srs/cards", query),
    srsCard: (id: string): string => `/srs/cards/${enc(id)}`,
    aiProviders: (): string => "/ai/providers",
    aiConversations: (): string => "/ai/conversations",
    aiConversation: (id: string): string => `/ai/conversations/${enc(id)}`,
    aiConversationMessages: (id: string): string => `/ai/conversations/${enc(id)}/messages`,
    accountExport: (): string => "/account/export",
    accountDeletion: (): string => "/account/deletion",
  },

  /**
   * Университетские интеграции — это Next.js-роуты `src/app/api/university/*`,
   * а не `/api/v1`-прокси; здесь только для единообразия (клиенты портала).
   */
  university: {
    status: (): string => "/api/university/status",
    schedule: (): string => "/api/university/schedule",
    oziz: (): string => "/api/university/oziz",
  },
} as const;

/**
 * Префиксы GET-путей, которые кэширует `apiCached` (общий контент, D5).
 * Живут в реестре, чтобы транспорт кэша не знал путей напрямую.
 */
export const cacheableGetPrefixes: readonly string[] = [
  "/subjects",
  "/subjects?",
  "/subjects/",
  "/subjects-catalog",
  "/subject-plans/",
  "/tests",
  "/tests?",
  "/materials",
  "/materials?",
  "/lectures",
  "/lectures?",
  "/tickets",
  "/tickets?",
  "/subject-materials",
  "/subject-materials?",
  "/trainers/feed",
  "/trainers/feed?",
];
