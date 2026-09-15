export default function HelpPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Помощь</h1>
      <div className="card p-6 max-w-2xl space-y-4 text-gray-700">
        <p>
          Платформа <strong>Медбиохим</strong> — учебная система для студентов и
          преподавателей.
        </p>
        <p>
          По вопросам доступа и технических проблем обращайтесь к администратору
          или старосте группы.
        </p>
        <p className="text-sm text-gray-500">
          Архитектура: Vercel + SpaceWeb + Supabase + B2.
        </p>
      </div>
    </div>
  );
}
