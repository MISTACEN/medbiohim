          <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="academic-identity">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-100 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
              <GraduationCap className="h-3.5 w-3.5 text-indigo-500" />
              Группа:{" "}
              <span className="font-semibold text-slate-900">
                {user?.groupName || user?.groupCode || "не назначена"}
              </span>
            </span>
            <span className="inline-flex items-center rounded-xl border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
              Курс:{" "}
              <span className="ml-1 font-semibold text-slate-900">
                {user?.course != null ? user.course : "—"}
              </span>
            </span>
            <span className="inline-flex items-center rounded-xl border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
              Семестр:{" "}
              <span className="ml-1 font-semibold text-slate-900">
                {user?.semester != null ? user.semester : "—"}
              </span>
            </span>
            {!user?.groupId ? (
              <span className="text-xs text-amber-700">Админ может назначить группу в разделе «Пользователи»</span>
            ) : null}
          </div>
