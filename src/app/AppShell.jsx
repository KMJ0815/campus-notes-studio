import { BookOpen, CalendarDays, Download, GraduationCap, Home, ListTodo, Plus, Settings } from "lucide-react";
import { PAGE_DEFS } from "../lib/constants";
import { AppShellButton, Chip, IconButton, Panel } from "../components/ui";

function pageTitle(page) {
  if (page === PAGE_DEFS.timetable) return "時間割";
  if (page === PAGE_DEFS.library) return "授業一覧";
  if (page === PAGE_DEFS.todos) return "ToDo";
  return "ダッシュボード";
}

function pageLead(page) {
  if (page === PAGE_DEFS.timetable) return "曜日と時限ごとの授業予定を整理";
  if (page === PAGE_DEFS.library) return "授業ごとの資料と記録を横断して確認";
  if (page === PAGE_DEFS.todos) return "今学期の未完了タスクと完了履歴を一覧";
  return "今学期の動きと最近の更新を確認";
}

export function AppShell({
  page,
  onPageChange,
  settings,
  busy,
  stats,
  pwaState,
  onCreateSubject,
  onOpenSettings,
  onExport,
  children,
}) {
  const currentTermLabel = settings.termLabel || settings.currentTermKey;
  const todayClassesCount = stats.todayClasses.length;
  const openTodosCount = stats.openTodosCount ?? 0;

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900">
      <div className="mx-auto grid max-w-[1880px] gap-6 p-4 md:grid-cols-[280px_minmax(0,1fr)] md:p-6">
        <aside className="space-y-4">
          <section aria-label="現在の学期ステータス">
            <Panel className="overflow-hidden bg-slate-50 px-4 py-4 text-slate-900 ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Campus Notes Studio</p>
                  <div className="mt-3 flex items-start gap-3">
                    <div className="rounded-2xl bg-slate-900 p-2.5 text-white">
                      <GraduationCap className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">現在の学期</p>
                      <h1 className="mt-1 truncate text-lg font-semibold">{currentTermLabel}</h1>
                      <p className="mt-1 text-sm text-slate-600">今日の授業と未完了タスクをすぐ確認できます。</p>
                    </div>
                  </div>
                </div>
                <div className="shrink-0">
                  <Chip tone={pwaState.isOnline ? "emerald" : "rose"}>{pwaState.isOnline ? "オンライン" : "オフライン"}</Chip>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onPageChange(PAGE_DEFS.timetable)}
                  className="rounded-2xl bg-white px-3 py-3 text-left ring-1 ring-slate-200 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <p className="text-[11px] text-slate-500">今日の授業</p>
                  <p className="mt-1 text-lg font-semibold">{todayClassesCount}件</p>
                </button>
                <button
                  type="button"
                  onClick={() => onPageChange(PAGE_DEFS.todos)}
                  className="rounded-2xl bg-white px-3 py-3 text-left ring-1 ring-slate-200 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <p className="text-[11px] text-slate-500">未完了ToDo</p>
                  <p className="mt-1 text-lg font-semibold">{openTodosCount}件</p>
                </button>
              </div>
            </Panel>
          </section>

          <div className="space-y-2">
            <AppShellButton active={page === PAGE_DEFS.dashboard} icon={Home} label="ダッシュボード" onClick={() => onPageChange(PAGE_DEFS.dashboard)} />
            <AppShellButton active={page === PAGE_DEFS.timetable} icon={CalendarDays} label="時間割" onClick={() => onPageChange(PAGE_DEFS.timetable)} />
            <AppShellButton active={page === PAGE_DEFS.library} icon={BookOpen} label="授業一覧" onClick={() => onPageChange(PAGE_DEFS.library)} />
            <AppShellButton active={page === PAGE_DEFS.todos} icon={ListTodo} label="ToDo" onClick={() => onPageChange(PAGE_DEFS.todos)} />
          </div>

          <Panel>
            <p className="text-sm font-semibold text-slate-900">クイック操作</p>
            <div className="mt-3 space-y-2">
              <IconButton icon={Plus} onClick={onCreateSubject}>
                授業を追加
              </IconButton>
              <IconButton icon={Settings} tone="light" className="w-full justify-center" onClick={onOpenSettings}>
                時間設定と学期設定
              </IconButton>
              <IconButton icon={Download} tone="light" className="w-full justify-center" onClick={onExport}>
                一括エクスポート
              </IconButton>
            </div>
          </Panel>

          <Panel className="bg-slate-50/70">
            <div className="flex flex-wrap items-center gap-2">
              {pwaState.updateAvailable ? (
                <IconButton icon={Download} tone="light" className="w-full justify-center" onClick={pwaState.applyPwaUpdate}>
                  更新を適用
                </IconButton>
              ) : pwaState.isInstalledApp ? (
                <Chip tone="indigo">インストール済み</Chip>
              ) : pwaState.installPromptEvent ? (
                <IconButton icon={Download} tone="light" className="w-full justify-center" onClick={pwaState.handleInstallApp}>
                  PWAアプリとして追加
                </IconButton>
              ) : pwaState.pwaRegistrationState === "ready" ? (
                <Chip tone="indigo">PWA配備待ち</Chip>
              ) : pwaState.pwaRegistrationState === "missing" ? (
                <Chip tone="amber">service worker 未配備</Chip>
              ) : (
                <Chip tone="slate">通常ブラウザ表示</Chip>
              )}
            </div>
          </Panel>
        </aside>

        <main className="min-w-0 space-y-6">
          <div className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-slate-500">{pageLead(page)}</p>
              <h2 className="text-2xl font-semibold text-slate-900">{pageTitle(page)}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {busy ? <Chip tone="amber">保存中…</Chip> : <Chip tone="emerald">ローカル保存</Chip>}
              <IconButton icon={Plus} onClick={onCreateSubject}>
                授業追加
              </IconButton>
            </div>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
