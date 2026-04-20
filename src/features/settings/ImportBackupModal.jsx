import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { IconButton, Modal, Panel } from "../../components/ui";

function CountRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <span>{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}

export function ImportBackupModal({ open, preview, importing, error = "", onClose, onConfirm }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      lockClose={importing}
      title="バックアップを復元"
      subtitle="現在のローカルデータを置き換えます。復元後はアプリ状態を再初期化します。"
      maxWidth="max-w-3xl"
    >
      {preview ? (
        <div className="space-y-6">
          <Panel className="space-y-3 bg-slate-50">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{preview.fileName}</p>
                <p className="mt-1 text-sm text-slate-500">形式 v{preview.version} / {preview.currentTermLabel || preview.currentTermKey}</p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <p>current term</p>
                <p className="mt-1 font-medium text-slate-700">{preview.currentTermKey}</p>
              </div>
            </div>
          </Panel>

          <div className="grid gap-3 md:grid-cols-2">
            <CountRow label="学期ラベル" value={preview.counts.termMeta} />
            <CountRow label="コマ定義" value={preview.counts.periods} />
            <CountRow label="授業" value={preview.counts.subjects} />
            <CountRow label="時間割コマ" value={preview.counts.slots} />
            <CountRow label="ノート" value={preview.counts.notes} />
            <CountRow label="出席" value={preview.counts.attendance} />
            <CountRow label="ToDo" value={preview.counts.todos} />
            <CountRow label="資料メタ情報" value={preview.counts.materials} />
            <CountRow label="資料ファイル" value={preview.counts.materialFiles} />
          </div>

          {preview.warnings.length > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">警告があります</p>
                  <ul className="mt-2 space-y-1">
                    {preview.warnings.map((warning) => (
                      <li key={`${warning.code}:${warning.materialId || warning.displayName || warning.message}`}>
                        {warning.displayName || warning.message || warning.code}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-amber-800">
                    欠損ファイルは資料メタ情報だけ復元されます。ZIP 自体が不正な場合は復元されません。
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900">
              {error}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-6">
        <IconButton tone="light" onClick={onClose} disabled={importing}>
          キャンセル
        </IconButton>
        <IconButton icon={CheckCircle2} onClick={onConfirm} disabled={importing}>
          {importing ? "復元中…" : "現在のデータを置き換えて復元"}
        </IconButton>
      </div>
    </Modal>
  );
}
