import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

const modalCloseStack = [];

function pushModalCloser(closer) {
  modalCloseStack.push(closer);
}

function removeModalCloser(closer) {
  const index = modalCloseStack.lastIndexOf(closer);
  if (index >= 0) modalCloseStack.splice(index, 1);
}

function topModalCloser() {
  return modalCloseStack[modalCloseStack.length - 1] || null;
}

export function AppShellButton({ active, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
        active
          ? "bg-slate-900 text-white shadow-lg"
          : "bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

export function Chip({ children, tone = "slate" }) {
  const styles = {
    slate: "bg-slate-100 text-slate-700",
    indigo: "bg-indigo-100 text-indigo-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    rose: "bg-rose-100 text-rose-700",
  };

  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${styles[tone]}`}>{children}</span>;
}

export function IconButton({ onClick, icon: Icon, children, tone = "dark", className = "", type = "button", disabled = false }) {
  const toneClass =
    tone === "light"
      ? "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
      : tone === "danger"
        ? "bg-rose-600 text-white hover:bg-rose-700"
        : "bg-slate-900 text-white hover:bg-slate-800";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClass} ${className}`}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

export function IconActionButton({ onClick, icon: Icon, label, tone = "default", className = "", type = "button", disabled = false }) {
  const toneClass =
    tone === "danger"
      ? "text-slate-500 hover:bg-slate-100 hover:text-rose-700"
      : "text-slate-500 hover:bg-slate-100 hover:text-slate-700";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`rounded-2xl p-2 transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClass} ${className}`}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
    </button>
  );
}

export function Panel({ children, className = "" }) {
  return <div className={`min-w-0 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 ${className}`}>{children}</div>;
}

export function Field({ label, children, hint }) {
  return (
    <label className="block space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

export function TextInput(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 ${props.className || ""}`}
    />
  );
}

export function TextArea(props) {
  return (
    <textarea
      {...props}
      className={`min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 ${props.className || ""}`}
    />
  );
}

export function SelectInput(props) {
  return (
    <select
      {...props}
      className={`w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 ${props.className || ""}`}
    />
  );
}

export function Modal({ open, title, subtitle, onClose, children, maxWidth = "max-w-4xl", lockClose = false }) {
  useEffect(() => {
    if (!open || (!onClose && !lockClose)) return undefined;
    const closer = () => {
      if (lockClose) return;
      onClose?.();
    };
    pushModalCloser(closer);
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (topModalCloser() !== closer) return;
      event.stopPropagation();
      if (lockClose) return;
      closer();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      removeModalCloser(closer);
    };
  }, [lockClose, onClose, open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 md:p-8"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !lockClose) onClose?.();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className={`w-full ${maxWidth} rounded-[28px] bg-white shadow-2xl ring-1 ring-slate-200`}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="閉じる"
                title="閉じる"
                disabled={lockClose || !onClose}
                className="rounded-2xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
      {Icon ? <Icon className="mb-3 h-8 w-8 text-slate-400" /> : null}
      <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
      {description ? <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, note }) {
  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
          {note ? <p className="mt-1 text-xs text-slate-400">{note}</p> : null}
        </div>
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Panel>
  );
}

export function LoadingScreen({ label = "アプリを初期化しています…" }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl bg-white px-8 py-6 shadow-sm ring-1 ring-slate-200"
      >
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 animate-pulse rounded-full bg-indigo-500" />
          <p className="text-sm font-medium text-slate-700">{label}</p>
        </div>
      </motion.div>
    </div>
  );
}

export function ErrorScreen({
  title = "アプリを初期化できませんでした",
  description,
  details,
  showDetails = false,
  onToggleDetails,
  onRetry,
  onReset,
  busy = false,
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <p className="mt-2 text-sm text-slate-600">{description}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <IconButton onClick={onRetry} disabled={busy}>
            再試行
          </IconButton>
          <IconButton tone="light" onClick={onReset} disabled={busy}>
            ローカルDBをリセット
          </IconButton>
          {details ? (
            <IconButton tone="light" onClick={onToggleDetails} disabled={busy}>
              {showDetails ? "詳細を隠す" : "エラー詳細を表示"}
            </IconButton>
          ) : null}
        </div>

        {details && showDetails ? (
          <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-950 px-4 py-3 text-xs leading-6 text-slate-100">
            {details}
          </pre>
        ) : null}
      </motion.div>
    </div>
  );
}

function toastIcon(tone) {
  if (tone === "success") return CheckCircle2;
  if (tone === "warning") return AlertTriangle;
  return Info;
}

export function ToastViewport({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-3">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = toastIcon(toast.tone);
          const toneClass =
            toast.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : toast.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-slate-200 bg-white text-slate-900";

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              className={`pointer-events-auto rounded-3xl border p-4 shadow-soft ${toneClass}`}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-white/70 p-2">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{toast.title}</p>
                  {toast.description ? <p className="mt-1 text-sm opacity-80">{toast.description}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => onDismiss(toast.id)}
                  aria-label="閉じる"
                  title="閉じる"
                  className="rounded-2xl p-1 text-current/70 transition hover:bg-white/60 hover:text-current"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">閉じる</span>
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
