import { BookOpen, CalendarDays, Download, GraduationCap, Home, Plus, Settings } from "lucide-react";
import { PAGE_DEFS } from "../lib/constants";
import { AppShellButton, Chip, IconButton, Panel } from "../components/ui";

function pageTitle(page) {
  if (page === PAGE_DEFS.timetable) return "時間割";
  if (page === PAGE_DEFS.library) return "授業一覧";
  return "ダッシュボード";
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
  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900">
      <div className="mx-auto grid max-w-[1880px] gap-6 p-4 md:grid-cols-[280px_minmax(0,1fr)] md:p-6">
        <aside className="space-y-4">
          <Panel className="overflow-hidden bg-slate-950 text-white ring-0">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/10 p-3">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-white/70">授業ノート管理</p>
                <h1 className="text-lg font-semibold">Campus Notes Studio</h1>
              </div>
            </div>
            <div className="mt-4 rounded-2xl bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-white/60">Current term</p>
              <p className="mt-2 text-base font-semibold">{settings.termLabel || settings.currentTermKey}</p>
            </div>
          </Panel>

          <div className="space-y-2">
            <AppShellButton active={page === PAGE_DEFS.dashboard} icon={Home} label="ダッシュボード" onClick={() => onPageChange(PAGE_DEFS.dashboard)} />
            <AppShellButton active={page === PAGE_DEFS.timetable} icon={CalendarDays} label="時間割" onClick={() => onPageChange(PAGE_DEFS.timetable)} />
            <AppShellButton active={page === PAGE_DEFS.library} icon={BookOpen} label="授業一覧" onClick={() => onPageChange(PAGE_DEFS.library)} />
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

          <Panel>
            <p className="text-sm font-semibold text-slate-900">今学期の状況</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">授業</p>
                <p className="mt-1 text-xl font-semibold">{stats.activeSubjectsCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">ノート</p>
                <p className="mt-1 text-xl font-semibold">{stats.notesCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">資料</p>
                <p className="mt-1 text-xl font-semibold">{stats.materialsCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">出席記録</p>
                <p className="mt-1 text-xl font-semibold">{stats.attendanceCount}</p>
              </div>
            </div>
          </Panel>

          <Panel className="bg-slate-50/70">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={pwaState.isOnline ? "emerald" : "rose"}>{pwaState.isOnline ? "オンライン" : "オフライン"}</Chip>
              {pwaState.isInstalledApp ? (
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

        <main className="space-y-6">
          <div className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-slate-500">{settings.termLabel || settings.currentTermKey}</p>
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
