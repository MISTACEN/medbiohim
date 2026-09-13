import type {
  User,
  ScheduleEntry,
  HomeworkItem,
  Announcement,
  Subject,
  Material,
  TestItem,
  ProgressSubject,
  CommunityPost,
  TicketQuestion,
} from "@/types";

export const currentUser: User = {
  id: "u-001",
  name: "Egor Ryazansev",
  email: "egor@example.com",
  role: "student",
  course: 1,
  semester: 2,
  groupId: "g-101",
  groupName: "БХ-101",
};

export const todaySchedule: ScheduleEntry[] = [
  { id: "s1", subject: "Информатика", type: "Практика", startTime: "08:00", endTime: "10:30", room: "А-204", isNonStandard: true, topic: "Алгоритмы", dayIndex: 5, slotIndex: 0 },
  { id: "s2", subject: "Гистология", type: "Лекция", startTime: "10:40", endTime: "12:20", room: "ЛК-1", topic: "Ткани", dayIndex: 5, slotIndex: 1 },
  { id: "s3", subject: "Физиология", type: "Лабораторная", startTime: "12:50", endTime: "14:30", room: "Лаб-3", dayIndex: 5, slotIndex: 2 },
];

export const weekSchedule: ScheduleEntry[] = [
  { id: "w1", subject: "Биология", type: "Лекция", startTime: "08:30", endTime: "10:10", room: "ЛК-2", dayIndex: 0, slotIndex: 0, topic: "Цитология" },
  { id: "w2", subject: "Химия", type: "Практика", startTime: "10:40", endTime: "12:20", room: "Лаб-1", dayIndex: 0, slotIndex: 1 },
  { id: "w3", subject: "Информатика", type: "Лекция", startTime: "08:30", endTime: "10:10", room: "А-101", dayIndex: 1, slotIndex: 0 },
  { id: "w4", subject: "Физиология", type: "Лекция", startTime: "12:50", endTime: "14:30", room: "ЛК-1", dayIndex: 1, slotIndex: 2 },
  { id: "w5", subject: "Гистология", type: "Практика", startTime: "10:40", endTime: "12:20", room: "Лаб-2", dayIndex: 2, slotIndex: 1 },
  { id: "w6", subject: "Биология", type: "Семинар", startTime: "14:45", endTime: "16:25", room: "А-204", dayIndex: 2, slotIndex: 3 },
  { id: "w7", subject: "Химия", type: "Лекция", startTime: "08:30", endTime: "10:10", room: "ЛК-3", dayIndex: 3, slotIndex: 0 },
  { id: "w8", subject: "Физиология", type: "Лабораторная", startTime: "10:40", endTime: "12:20", room: "Лаб-3", dayIndex: 3, slotIndex: 1 },
  { id: "w9", subject: "Информатика", type: "Практика", startTime: "12:50", endTime: "14:30", room: "А-204", dayIndex: 4, slotIndex: 2 },
  ...todaySchedule,
];

export const homeworks: HomeworkItem[] = [
  { id: "hw1", title: "Протокол практики «Физиология клетки»", subject: "Физиология", dueAt: "2026-09-14", status: "pending", description: "Оформите протокол лабораторной работы." },
  { id: "hw2", title: "Реферат по цитологии", subject: "Биология", dueAt: "2026-09-18", status: "pending", description: "Объём 8–12 страниц." },
  { id: "hw3", title: "Расчётные задачи — химия", subject: "Химия", dueAt: "2026-09-10", status: "overdue", description: "Задачи 12–18 из методички." },
  { id: "hw4", title: "Отчёт по информатике", subject: "Информатика", dueAt: "2026-09-05", status: "graded", grade: 4, feedback: "Хорошо. Добавьте блок-схему.", description: "3 алгоритма сортировки." },
  { id: "hw5", title: "Конспект: ткани", subject: "Гистология", dueAt: "2026-09-08", status: "submitted", description: "Конспект по эпителиальным тканям." },
];

export const announcements: Announcement[] = [
  { id: "a1", title: "Изменение расписания", body: "Информатика перенесена на 08:00–10:30.", createdAt: "2026-09-11", type: "change" },
  { id: "a2", title: "Новые материалы", body: "Методички по гистологии.", createdAt: "2026-09-10", type: "news" },
  { id: "a3", title: "Обновление платформы", body: "Медбиохим обновлён.", createdAt: "2026-09-09", type: "system" },
];

export const subjects: Subject[] = [
  { id: "sub1", name: "Гистология, цитология", course: 2, semester: 3, controlType: "exam", lectureHours: 50, practiceHours: 108 },
  { id: "sub2", name: "Информатика", course: 1, semester: 2, controlType: "exam", lectureHours: 36, practiceHours: 54 },
  { id: "sub3", name: "Физиология", course: 1, semester: 2, controlType: "credit", lectureHours: 40, practiceHours: 60 },
  { id: "sub4", name: "Неорганическая химия", course: 1, semester: 1, controlType: "exam", lectureHours: 48, practiceHours: 72 },
  { id: "sub5", name: "Биология", course: 1, semester: 1, controlType: "exam", lectureHours: 54, practiceHours: 72 },
  { id: "sub6", name: "Теория вероятностей", course: 1, semester: 2, controlType: "exam", lectureHours: 36, practiceHours: 36 },
];

export const materials: Material[] = [
  { id: "m1", title: "Клеточная мембрана.pdf", subject: "Биология", type: "PDF", size: "2.4 МБ", date: "2026-09-05", fileId: "f-001" },
  { id: "m2", title: "Методичка по цитологии.docx", subject: "Биология", type: "DOCX", size: "1.1 МБ", date: "2026-09-01", fileId: "f-002" },
  { id: "m3", title: "Презентация — ткани.pptx", subject: "Гистология", type: "PPTX", size: "8.7 МБ", date: "2026-08-28", fileId: "f-003" },
  { id: "m4", title: "Задачи по химии.pdf", subject: "Химия", type: "PDF", size: "3.2 МБ", date: "2026-09-03", fileId: "f-004" },
  { id: "m5", title: "Протокол лабораторной.docx", subject: "Физиология", type: "DOCX", size: "0.4 МБ", date: "2026-09-07", fileId: "f-005" },
];

export const tests: TestItem[] = [
  { id: "t1", title: "Общая генетика — базовый", subject: "Биология", type: "test", questionCount: 25, course: 1, status: "доступен" },
  { id: "t2", title: "Неорганическая химия — практика", subject: "Химия", type: "test", questionCount: 40, course: 1, status: "доступен" },
  { id: "t3", title: "Экзаменационный билет — Гистология", subject: "Гистология", type: "ticket", questionCount: 4, course: 2 },
  { id: "t4", title: "Цитология — самопроверка", subject: "Биология", type: "test", questionCount: 15, course: 1, status: "доступен" },
  { id: "t5", title: "Билет — Химия", subject: "Химия", type: "ticket", questionCount: 4, course: 1 },
];

export const stats = { disciplines: 6, questions: 400, labs: 13, semesters: 12 };

export const progressData: ProgressSubject[] = [
  { subject: "Биология", testsDone: 3, testsTotal: 5, avgScore: 78, homeworkDone: 2, homeworkTotal: 3 },
  { subject: "Химия", testsDone: 1, testsTotal: 4, avgScore: 65, homeworkDone: 0, homeworkTotal: 2 },
  { subject: "Физиология", testsDone: 2, testsTotal: 3, avgScore: 88, homeworkDone: 1, homeworkTotal: 2 },
  { subject: "Информатика", testsDone: 4, testsTotal: 4, avgScore: 92, homeworkDone: 1, homeworkTotal: 1 },
  { subject: "Гистология", testsDone: 0, testsTotal: 2, avgScore: 0, homeworkDone: 1, homeworkTotal: 1 },
];

export const communityPosts: CommunityPost[] = [
  { id: "c1", author: "Анна Смирнова", role: "Староста", title: "Сбор на методички", body: "До пятницы сдаём деньги на распечатку.", createdAt: "2026-09-12", likes: 12, comments: 5 },
  { id: "c2", author: "Иван Петров", role: "Преподаватель", title: "Консультация", body: "В среду в 16:00 по химии, ЛК-3.", createdAt: "2026-09-11", likes: 28, comments: 3 },
  { id: "c3", author: "Egor Ryazansev", role: "Студент", title: "Конспект по цитологии?", body: "Пропустил лекцию 8 сентября.", createdAt: "2026-09-10", likes: 4, comments: 7 },
  { id: "c4", author: "Кафедра", role: "Система", title: "Новые тесты", body: "Доступна общая генетика.", createdAt: "2026-09-09", likes: 15, comments: 0 },
];

export const ticketPool: Record<string, TicketQuestion[]> = {
  "Гистология": [
    { number: 1, kind: "Теория", text: "Строение и функции эпителиальных тканей." },
    { number: 2, kind: "Теория", text: "Классификация соединительных тканей." },
    { number: 3, kind: "Практика", text: "Опишите микропрепарат «Хрящевая ткань»." },
    { number: 4, kind: "Расчёт", text: "Рассчитайте площадь ядра по микрофотографии." },
  ],
  "Химия": [
    { number: 1, kind: "Теория", text: "Периодический закон и строение атома." },
    { number: 2, kind: "Теория", text: "Типы химической связи." },
    { number: 3, kind: "Практика", text: "Уравнения реакций для Fe³⁺." },
    { number: 4, kind: "Расчёт", text: "Рассчитайте молярную массу." },
  ],
  "Биология": [
    { number: 1, kind: "Теория", text: "Клеточная теория. Органоиды." },
    { number: 2, kind: "Теория", text: "Митоз и мейоз." },
    { number: 3, kind: "Практика", text: "Задача по генетике Менделя." },
    { number: 4, kind: "Расчёт", text: "Сцепление генов и кроссинговер." },
  ],
};

export const examSummary = [
  { name: "Теория вероятностей", type: "экзамен" as const },
  { name: "Информатика", type: "экзамен" as const },
  { name: "Физиология", type: "зачёт" as const },
  { name: "Гистология", type: "зачёт" as const },
  { name: "Биология", type: "экзамен" as const },
  { name: "Неорганическая химия", type: "экзамен" as const },
];
