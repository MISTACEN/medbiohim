# Beta · сверка с концепцией

Ветка: `beta`

## Навигация

- [x] Короткое меню без Лекций/Билетов/Практики/Материалов/Карточек/Плана/Тестов
- [x] Бейдж `beta` в сайдбаре

## Предмет как центр

- [x] `/subjects` — список по курсу/семестру
- [x] `/subjects/[id]` — хаб блоков (plan/tickets/practice/lectures/materials/cards/progress)
- [ ] Админ: порядок и visibility блоков
- [ ] Админ: копировать семестр (без personal cards/progress)

## Данные

- [ ] `subject_instance` (subject_id, course, semester, year)
- [ ] SRS shared|personal + instance id
- [ ] Progress per subject_instance

## Роли

- [ ] Filter subjects by assignment
- [ ] Teacher scoped edit
- [ ] Guest preview

## Совместимость

- [x] Deep-link старых URL из хаба предмета
- [x] Redirect curriculum/tests/trainers → subjects
