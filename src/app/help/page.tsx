import Link from "next/link";
import { HelpTabs } from "@/components/help/HelpTabs";
import { CHANGELOG } from "@/data/changelog";

/**
 * FA7: /help — настоящий FAQ для студента.
 *
 * Раньше здесь была заглушка с внутренней архитектурой платформы, которая
 * студенту ничего не говорит. Теперь — конкретные ответы: как войти, где
 * задания, как привязать Telegram, что делать при ошибке в вопросе.
 */

const FAQ: Array<{ title: string; body: React.ReactNode }> = [
  {
    title: "Как войти и что делать, если забыл пароль",
    body: (
      <>
        <p>
          Вход — на странице <Link href="/login" className="text-indigo-600 hover:underline">Вход</Link> по
          email и паролю или через аккаунт Google. Учётную запись вам выдаёт
          администратор или староста группы.
        </p>
        <p>
          Если пароль забыт, на странице входа нажмите «Забыли пароль?» — на
          почту придёт письмо со ссылкой для смены. Письма нет? Проверьте папку
          «Спам» и подождите пару минут. Так и не пришло — напишите
          администратору: возможно, аккаунт создан на другой адрес.
        </p>
      </>
    ),
  },
  {
    title: "Telegram-бот: уведомления о заданиях и расписании",
    body: (
      <>
        <p>
          Откройте <Link href="/settings" className="text-indigo-600 hover:underline">Настройки</Link>,
          раздел Telegram, и привяжите свой аккаунт — бот пришлёт код, введите
          его на сайте, и всё готово.
        </p>
        <p>
          После привязки бот напомнит о сроках заданий и сообщит об изменениях в
          расписании. Отвязать можно там же, в Настройках.
        </p>
      </>
    ),
  },
  {
    title: "Браузерное расширение для импорта из ЕИОС",
    body: (
      <p>
        Чтобы перенести данные из ЕИОС, установите{" "}
        <Link href="/extension" className="text-indigo-600 hover:underline">браузерное расширение</Link> —
        на странице есть инструкция по установке и использованию для Chrome и
        совместимых браузеров.
      </p>
    ),
  },
  {
    title: "Где смотреть задания",
    body: (
      <p>
        Все домашние задания — в разделе{" "}
        <Link href="/homework" className="text-indigo-600 hover:underline">Задания</Link>: что задано и до
        какого числа, сдача текстового ответа, отметка о выполнении, а после
        проверки — оценка и комментарий преподавателя.
      </p>
    ),
  },
  {
    title: "Тесты и экзаменационные билеты",
    body: (
      <p>
        Тесты по предметам — в разделе{" "}
        <Link href="/tests" className="text-indigo-600 hover:underline">Тесты</Link>. Экзаменационные
        билеты — в разделе{" "}
        <Link href="/tickets" className="text-indigo-600 hover:underline">Билеты</Link>. В режиме
        подготовки к каждому вопросу показан эталонный ответ, так что билеты
        удобно прорабатывать самостоятельно.
      </p>
    ),
  },
  {
    title: "Карточки для запоминания (SRS)",
    body: (
      <p>
        Раздел <Link href="/cards" className="text-indigo-600 hover:underline">Карточки</Link> — это
        интервальное повторение: карточки с терминами и определениями
        появляются чаще, если вы их забываете, и реже, если отвечаете
        уверенно. Достаточно несколько минут в день.
      </p>
    ),
  },
  {
    title: "Тренажёры",
    body: (
      <p>
        В разделе <Link href="/trainers" className="text-indigo-600 hover:underline">Тренажёры</Link> —
        практика по гистологии, лейкоцитарной формуле и другим темам:
        распознавайте препараты и сразу проверяйте себя.
      </p>
    ),
  },
  {
    title: "Как включить тёмную тему",
    body: (
      <p>
        Откройте <Link href="/settings" className="text-indigo-600 hover:underline">Настройки</Link> и
        выберите оформление — светлое или тёмное. Выбор запоминается и
        применяется на всех устройствах, где вы входите в аккаунт.
      </p>
    ),
  },
  {
    title: "Нашёл ошибку в вопросе — что делать",
    body: (
      <p>
        Под вопросом в тесте есть кнопка «Сообщить об ошибке» (значок флажка).
        Нажмите её, выберите, что именно не так, и при желании добавьте
        пояснение — обращение сразу попадёт к администраторам. Спасибо, что
        помогаете делать банк вопросов лучше!
      </p>
    ),
  },
];

export default async function HelpPage({ searchParams }: { searchParams?: Promise<{ tab?: string }> }) {
  const params = (await searchParams) || {};
  const initialTab = params.tab === "news" ? "news" : "faq";

  const faqSection = (
    <>
      <div className="space-y-4">
        {FAQ.map((item) => (
          <section key={item.title} className="card p-5">
            <h2 className="font-semibold">{item.title}</h2>
            <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-600">
              {item.body}
            </div>
          </section>
        ))}
      </div>

      <section className="card border-indigo-100 bg-indigo-50/50 p-5">
        <h2 className="font-semibold">Не нашли ответ?</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Напишите администратору или старосте группы — они помогут с доступом,
          группой и техническими проблемами. Если сломался сам сайт (что-то не
          открывается или выдаёт ошибку), нажмите «Жалоба на ошибку на сайте»
          в меню — обращение уйдёт администрации с адресом страницы.
        </p>
      </section>
    </>
  );

  const newsSection = (
    <div className="space-y-4">
      {CHANGELOG.length === 0 ? (
        <p className="text-sm text-slate-500">Пока ничего не менялось.</p>
      ) : (
        CHANGELOG.map((entry) => (
          <article key={entry.date} className="card p-5">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 className="text-lg font-bold text-slate-900">{entry.title}</h2>
              <time className="text-xs tabular-nums text-slate-400" dateTime={entry.date}>
                {entry.date.split("-").reverse().join(".")}
              </time>
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
              {entry.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </article>
        ))
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="page-title">Помощь</h1>
        <p className="page-subtitle">
          Короткие ответы на частые вопросы и лента изменений платформы — в одном месте.
        </p>
      </header>

      <HelpTabs initialTab={initialTab} faqSection={faqSection} newsSection={newsSection} />
    </div>
  );
}
