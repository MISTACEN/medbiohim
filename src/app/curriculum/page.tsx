import Link from "next/link";
import { subjects } from "@/lib/mock-data";

export default function CurriculumPage() {
  const exams = subjects.filter((s) => s.controlType === "exam").length;
  const credits = subjects.filter((s) => s.controlType === "credit").length;
  const lectureHours = subjects.reduce((sum, s) => sum + (s.lectureHours || 0), 0);
  const practiceHours = subjects.reduce((sum, s) => sum + (s.practiceHours || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Учебный план</h1>
        <p className="mt-1 text-gray-500">Курс 1–2 · Семестры 1–3</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="card p-4 text-center">
          <div className="text-xl font-bold text-primary">{subjects.length}</div>
          <div className="text-xs text-gray-500">дисциплин</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xl font-bold text-danger">{exams}</div>
          <div className="text-xs text-gray-500">экзаменов</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xl font-bold text-success">{credits}</div>
          <div className="text-xs text-gray-500">зачётов</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xl font-bold text-primary">{lectureHours}</div>
          <div className="text-xs text-gray-500">лекц. часов</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xl font-bold text-primary">{practiceHours}</div>
          <div className="text-xs text-gray-500">практ. часов</div>
        </div>
      </div>
      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80 text-gray-500">
              <th className="px-4 py-3 font-medium">Предмет</th>
              <th className="px-4 py-3 font-medium">Курс</th>
              <th className="px-4 py-3 font-medium">Сем.</th>
              <th className="px-4 py-3 font-medium">Лекции</th>
              <th className="px-4 py-3 font-medium">Практика</th>
              <th className="px-4 py-3 font-medium">Контроль</th>
              <th className="px-4 py-3 font-medium">Действие</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                <td className="px-4 py-3">{s.course}</td>
                <td className="px-4 py-3">{s.semester}</td>
                <td className="px-4 py-3">{s.lectureHours ?? "—"}</td>
                <td className="px-4 py-3">{s.practiceHours ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={s.controlType === "exam" ? "font-medium text-danger" : "font-medium text-success"}>
                    {s.controlType === "exam" ? "Экзамен" : "Зачёт"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/subjects/${s.id}`} className="font-medium text-primary hover:underline">Открыть</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 md:hidden">
        {subjects.map((s) => (
          <Link key={s.id} href={`/subjects/${s.id}`} className="card block p-4">
            <div className="font-semibold text-gray-900">{s.name}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
              <span>Курс {s.course}</span>
              <span>Сем. {s.semester}</span>
              <span>{s.controlType === "exam" ? "Экзамен" : "Зачёт"}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
