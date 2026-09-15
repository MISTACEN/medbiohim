export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Настройки</h1>
      <div className="card p-6 space-y-4 max-w-lg">
        <div>
          <label className="block text-sm font-medium text-gray-700">Имя</label>
          <input type="text" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input type="email" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        </div>
        <button type="button" className="btn-primary">Сохранить</button>
      </div>
    </div>
  );
}
