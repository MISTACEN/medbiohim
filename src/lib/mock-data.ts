import type {
  User,
  ScheduleEntry,
  HomeworkItem,
  Announcement,
  Subject,
  Material,
  TestItem,
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
  {
    id: "s1",
    subject: "Информатика",
    type: "Практика",
    startTime: "08:00",
    endTime: "10:30",
    room: "А-204",
    isNonStandard: true,
    topic: "Алгоритмы и структуры данных",
  },
  {
    id: "s2",
    subject: "Гистология",
    type: "Лекция",
    startTime: "10:40",
    endTime: "12:20",
    room: "ЛК-1",
    topic: "Ткани организма",
  },
  {
    id: "s3",
    subject: "Физиология",
    type: "Лабораторная",
    startTime: "12:50",
    endTime: "14:30",
    room: "Лаб-3",
  },
];

export const homeworks: HomeworkItem[] = [
  {
    id: "hw1",
    title: "Протокол практики «Физиология клетки»",
    subject: "Физиология",
    dueAt: "2026-09-14",
    status: "pending",
  },
  {
    id: "hw2",
    title: "Реферат по цитологии",
    subject: "Биология",
    dueAt: "2026-09-18",
    status: "pending",
  },
  {
    id: "hw3",
    title: "Расчётные задачи — неорганическая химия",
    subject: "Химия",
    dueAt: "2026-09-10",
    status: "overdue",
  },
];

export const announcements: Announcement[] = [
  {
    id: "a1",
    title: "Изменение расписания на субботу",
    body: "Занятие по информатике перенесено на 08:00–10:30.",
    createdAt: "2026-09-11",
    type: "change",
  },
  {
    id: "a2",
    title: "Новые материалы по гистологии",
    body: "Загружены методички к лабораторным работам.",
    createdAt: "2026-09-10",
    type: "news",
  },
  {
    id: "a3",
    title: "Системное обновление",
    body: "Платформа Медбиохим обновлена. Доступны новые функции.",
    createdAt: "2026-09-09",
    type: "system",
  },
];

export const subjects: Subject[] = [
  {
    id: "sub1",
    name: "Гистология, цитология",
    course: 2,
    semester: 3,
    controlType: "exam",
    lectureHours: 50,
    practiceHours: 108,
  },
  {
    id: "sub2",
    name: "Информатика",
    course: 1,
    semester: 2,
    controlType: "exam",
    lectureHours: 36,
    practiceHours: 54,
  },
  {
    id: "sub3",
    name: "Физиология",
    course: 1,
    semester: 2,
    controlType: "credit",
    lectureHours: 40,
    practiceHours: 60,
  },
  {
    id: "sub4",
    name: "Неорганическая химия",
    course: 1,
    semester: 1,
    controlType: "exam",
    lectureHours: 48,
    practiceHours: 72,
  },
];

export const materials: Material[] = [
  {
    id: "m1",
    title: "Клеточная мембрана.pdf",
    subject: "Биология",
    type: "PDF",
    size: "2.4 МБ",
    date: "2026-09-05",
    fileId: "f-001",
  },
  {
    id: "m2",
    title: "Методичка по цитологии.docx",
    subject: "Биология",
    type: "DOCX",
    size: "1.1 МБ",
    date: "2026-09-01",
    fileId: "f-002",
  },
  {
    id: "m3",
    title: "Презентация — ткани.pptx",
    subject: "Гистология",
    type: "PPTX",
    size: "8.7 МБ",
    date: "2026-08-28",
    fileId: "f-003",
  },
];

export const tests: TestItem[] = [
  {
    id: "t1",
    title: "Общая генетика — базовый",
    subject: "Биология",
    type: "test",
    questionCount: 25,
    course: 1,
    status: "доступен",
  },
  {
    id: "t2",
    title: "Неорганическая химия — практика",
    subject: "Химия",
    type: "test",
    questionCount: 40,
    course: 1,
    status: "доступен",
  },
  {
    id: "t3",
    title: "Экзаменационный билет — Гистология",
    subject: "Гистология",
    type: "ticket",
    questionCount: 4,
    course: 2,
  },
];

export const stats = {
  disciplines: 6,
  questions: 400,
  labs: 13,
  semesters: 12,
};
