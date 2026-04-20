import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, Plus, Upload } from "lucide-react";
import {
  buildStructuredTermKey,
  deepEqualJson,
  isValidStructuredTermKey,
  normalizeTimeInputValue,
  parseStructuredTermKey,
  suggestedTermLabel,
  uid,
} from "../../lib/utils";
import { Field, IconButton, Modal, SelectInput, TextInput } from "../../components/ui";
import { errorMessage } from "../../lib/errors";
import { downloadExportResult, prepareExport } from "../../services/exportService";
import { applyImportArchive, readImportArchive } from "../../services/importService";
import { ImportBackupModal } from "./ImportBackupModal";

const TERM_SEASON_OPTIONS = [
  { value: "spring", label: "春学期" },
  { value: "fall", label: "秋学期" },
];

export function SettingsModal({
  open,
  initialSettings,
  initialTermEditorState,
  loadTermEditorState,
  onClose,
  onSave,
  onImportApplied,
}) {
  const [draft, setDraft] = useState(null);
  const [initialSnapshot, setInitialSnapshot] = useState(null);
  const [loadedPeriodsTermKey, setLoadedPeriodsTermKey] = useState("");
  const [loadedPeriodsSnapshot, setLoadedPeriodsSnapshot] = useState([]);
  const [loadedTermLabel, setLoadedTermLabel] = useState("");
  const [termYear, setTermYear] = useState("");
  const [termSeason, setTermSeason] = useState("");
  const [legacyTermKeyWarning, setLegacyTermKeyWarning] = useState("");
  const [saving, setSaving] = useState(false);
  const [switchingTerm, setSwitchingTerm] = useState(false);
  const [termSwitchError, setTermSwitchError] = useState("");
  const [exportError, setExportError] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [importPreviewState, setImportPreviewState] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const draftRef = useRef(null);
  const importFileInputRef = useRef(null);
  const importArchiveRef = useRef(null);

  function normalizePeriods(periods = []) {
    return periods.map((period) => ({
      ...period,
      startTime: normalizeTimeInputValue(period.startTime),
      endTime: normalizeTimeInputValue(period.endTime),
    }));
  }

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!open) return;
    const parsed = parseStructuredTermKey(initialTermEditorState?.termKey || initialSettings?.currentTermKey || "");
    const nextDraft = {
      currentTermKey: initialTermEditorState?.termKey || initialSettings?.currentTermKey || "",
      termLabel: initialTermEditorState?.label || initialSettings?.termLabel || "",
      exportIncludeFiles: Boolean(initialSettings?.exportIncludeFiles),
      periods: normalizePeriods(initialTermEditorState?.periods || []),
      baseUpdatedAt: initialSettings?.updatedAt || null,
    };
    setDraft(nextDraft);
    setInitialSnapshot(nextDraft);
    setLoadedPeriodsTermKey(nextDraft.currentTermKey);
    setLoadedPeriodsSnapshot(nextDraft.periods);
    setLoadedTermLabel(nextDraft.termLabel);
    setTermYear(parsed?.year || "");
    setTermSeason(parsed?.season || "");
    setLegacyTermKeyWarning(
      nextDraft.currentTermKey && !isValidStructuredTermKey(nextDraft.currentTermKey)
        ? `現在の内部学期キー「${nextDraft.currentTermKey}」は旧形式です。年度と学期を選び直してから保存してください。`
        : "",
    );
    setTermSwitchError("");
    setExportError("");
    setExportMessage("");
    setImportError("");
    importArchiveRef.current = null;
    setImportPreviewState(null);
    setSwitchingTerm(false);
  }, [open, initialSettings, initialTermEditorState]);

  const isDirty = draft && initialSnapshot ? !deepEqualJson(draft, initialSnapshot) : false;
  const termScopedDirty = draft
    ? draft.termLabel !== loadedTermLabel || !deepEqualJson(draft.periods, loadedPeriodsSnapshot)
    : false;
  const pendingTermKey = useMemo(() => buildStructuredTermKey(termYear, termSeason), [termSeason, termYear]);
  const termSelectionDirty = Boolean(draft && pendingTermKey && pendingTermKey !== draft.currentTermKey);

  function resetPendingTermSelection(termKey) {
    const parsed = parseStructuredTermKey(termKey);
    setTermYear(parsed?.year || "");
    setTermSeason(parsed?.season || "");
  }

  async function applyPendingTermSelection() {
    const nextTermKey = pendingTermKey;
    if (!nextTermKey) {
      setTermSwitchError("内部学期キーは YYYY-spring または YYYY-fall の形式で指定してください。");
      return;
    }

    const currentDraft = draftRef.current;
    if (!currentDraft || nextTermKey === currentDraft.currentTermKey) {
      setTermSwitchError("");
      return;
    }

    if (termScopedDirty) {
      const shouldContinue = window.confirm("学期を切り替えると、現在の学期設定の未保存変更は破棄されます。続けますか？");
      if (!shouldContinue) {
        resetPendingTermSelection(currentDraft.currentTermKey);
        return;
      }
    }

    setSwitchingTerm(true);
    setTermSwitchError("");

    try {
      const nextState = await loadTermEditorState(nextTermKey);
      const nextPeriods = normalizePeriods(
        nextState.periods.length > 0 ? nextState.periods : loadedPeriodsSnapshot.map((period) => ({ ...period })),
      );
      const nextLabel = nextState.label || suggestedTermLabel(nextTermKey);

      setDraft((current) => {
        if (!current) return current;
        return {
          ...current,
          currentTermKey: nextTermKey,
          termLabel: nextLabel,
          periods: nextPeriods,
        };
      });
      setLoadedPeriodsTermKey(nextTermKey);
      setLoadedPeriodsSnapshot(nextPeriods);
      setLoadedTermLabel(nextLabel);
      setLegacyTermKeyWarning("");
      resetPendingTermSelection(nextTermKey);
    } catch (error) {
      resetPendingTermSelection(currentDraft.currentTermKey);
      setTermSwitchError(errorMessage(error, "学期設定の読み込みに失敗しました。"));
    } finally {
      setSwitchingTerm(false);
    }
  }

  function requestClose() {
    if (saving || switchingTerm || importing || importPreviewState) return;
    if (isDirty && !window.confirm("未保存の変更があります。破棄しますか？")) return;
    onClose();
  }

  async function handleSave() {
    if (switchingTerm || !draft) return;
    if (!isValidStructuredTermKey(draft.currentTermKey.trim())) {
      setTermSwitchError("内部学期キーは YYYY-spring または YYYY-fall の形式で指定してください。");
      return;
    }
    setSaving(true);
    try {
      await onSave({ draft, periodsLoadedForTermKey: loadedPeriodsTermKey });
      onClose();
    } catch {
      return;
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExportError("");
    setExportMessage("");
    setExporting(true);
    try {
      let result = await prepareExport({
        includeFilesOverride: draftRef.current?.exportIncludeFiles,
      });
      if (result.status === "missing_files") {
        const shouldContinue = window.confirm(
          `資料ファイルが ${result.missingFiles.length} 件見つかりません。資料メタ情報だけでバックアップを続けますか？`,
        );
        if (!shouldContinue) return;
        result = await prepareExport({
          allowMissingFiles: true,
          includeFilesOverride: draftRef.current?.exportIncludeFiles,
        });
      }
      if (result.status !== "ready") {
        throw new Error("バックアップを準備できませんでした。");
      }
      downloadExportResult(result);
      setExportMessage(
        result.missingFiles?.length
          ? `バックアップをダウンロードしました。資料ファイル ${result.missingFiles.length} 件は欠損のため含まれていません。`
          : "バックアップをダウンロードしました。",
      );
    } catch (error) {
      setExportError(errorMessage(error, "バックアップの準備に失敗しました。"));
    } finally {
      setExporting(false);
    }
  }

  function handleOpenImportPicker() {
    setImportError("");
    if (importFileInputRef.current?.showPicker) {
      importFileInputRef.current.showPicker();
      return;
    }
    importFileInputRef.current?.click();
  }

  async function handleImportFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportError("");
    try {
      const nextState = await readImportArchive(file);
      importArchiveRef.current = nextState.archive;
      setImportPreviewState({
        ...nextState.preview,
        fileName: file.name,
      });
    } catch (error) {
      importArchiveRef.current = null;
      setImportPreviewState(null);
      setImportError(errorMessage(error, "インポート ZIP を解析できませんでした。"));
    }
  }

  async function handleConfirmImport() {
    if (!importPreviewState || !importArchiveRef.current) return;
    const shouldContinue = window.confirm(
      "現在のローカルデータをすべて置き換えます。必要なら先にバックアップを取ってから続けてください。復元を実行しますか？",
    );
    if (!shouldContinue) return;

    setImporting(true);
    try {
      const result = await applyImportArchive(importArchiveRef.current);
      importArchiveRef.current = null;
      setImportPreviewState(null);
      setImportError("");
      onClose();
      onImportApplied?.(result);
    } catch (error) {
      setImportError(errorMessage(error, "バックアップの復元に失敗しました。"));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={requestClose}
      lockClose={saving || switchingTerm || importing || Boolean(importPreviewState)}
      title="設定"
      maxWidth="max-w-5xl"
    >
      {draft ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-[180px_180px_auto]">
            <Field label="年度">
              <TextInput
                inputMode="numeric"
                maxLength={4}
                value={termYear}
                onChange={(event) => {
                  setTermYear(event.target.value.replace(/[^\d]/g, "").slice(0, 4));
                  setTermSwitchError("");
                }}
                placeholder="2026"
              />
            </Field>
            <Field label="学期">
              <SelectInput
                value={termSeason}
                onChange={(event) => {
                  setTermSeason(event.target.value);
                  setTermSwitchError("");
                }}
              >
                <option value="">選択してください</option>
                {TERM_SEASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <div className="flex items-end">
              <IconButton
                tone="light"
                className="w-full justify-center md:w-auto"
                onClick={applyPendingTermSelection}
                disabled={switchingTerm || !pendingTermKey || pendingTermKey === draft.currentTermKey}
              >
                学期を反映
              </IconButton>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="内部学期キー">
              <TextInput value={draft.currentTermKey} readOnly className="bg-slate-50" />
            </Field>
            <Field label="表示用学期ラベル">
              <TextInput
                value={draft.termLabel}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, termLabel: event.target.value }));
                }}
                placeholder="例: 2026年度 春学期"
              />
            </Field>
          </div>

          {legacyTermKeyWarning ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {legacyTermKeyWarning}
            </div>
          ) : null}

          {termSelectionDirty ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              学期の変更はまだ反映されていません。「学期を反映」を押してから保存してください。
            </div>
          ) : null}

          {termSwitchError ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {termSwitchError}
            </div>
          ) : null}

          <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input type="checkbox" checked={draft.exportIncludeFiles} onChange={(event) => setDraft((current) => ({ ...current, exportIncludeFiles: event.target.checked }))} />
            エクスポート時に資料ファイルも ZIP に含める
          </label>

          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">コマ時間設定</h4>
              </div>
              <IconButton
                tone="light"
                icon={Plus}
                onClick={() =>
                  setDraft((current) => {
                    const nextPeriodNo = current.periods.length
                      ? Math.max(...current.periods.map((period) => Number(period.periodNo))) + 1
                      : 1;
                    return {
                      ...current,
                      periods: [
                        ...current.periods,
                        {
                          id: uid(),
                          periodNo: nextPeriodNo,
                          label: `${nextPeriodNo}限`,
                          startTime: normalizeTimeInputValue("09:00"),
                          endTime: normalizeTimeInputValue("10:40"),
                          isEnabled: true,
                        },
                      ],
                    };
                  })
                }
              >
                コマを追加
              </IconButton>
            </div>

            <div className="mt-4 space-y-3">
              {[...draft.periods].sort((a, b) => a.periodNo - b.periodNo).map((period) => (
                <div key={period.id} className="grid gap-3 rounded-3xl border border-slate-200 p-4 md:grid-cols-[110px_1fr_150px_150px_120px_80px] md:items-end">
                  <Field label="コマ番号">
                    <TextInput
                      type="number"
                      min={1}
                      value={period.periodNo ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        const parsed = Number(value);
                        if (value === "" || !Number.isInteger(parsed) || parsed < 1) return;
                        setDraft((current) => ({
                          ...current,
                          periods: current.periods.map((item) => (item.id === period.id ? { ...item, periodNo: parsed } : item)),
                        }));
                      }}
                    />
                  </Field>
                  <Field label="表示ラベル">
                    <TextInput
                      value={period.label}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDraft((current) => ({
                          ...current,
                          periods: current.periods.map((item) => (item.id === period.id ? { ...item, label: value } : item)),
                        }));
                      }}
                    />
                  </Field>
                  <Field label="開始">
                    <TextInput
                      type="time"
                      value={normalizeTimeInputValue(period.startTime)}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDraft((current) => ({
                          ...current,
                          periods: current.periods.map((item) => (item.id === period.id ? { ...item, startTime: normalizeTimeInputValue(value) } : item)),
                        }));
                      }}
                    />
                  </Field>
                  <Field label="終了">
                    <TextInput
                      type="time"
                      value={normalizeTimeInputValue(period.endTime)}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDraft((current) => ({
                          ...current,
                          periods: current.periods.map((item) => (item.id === period.id ? { ...item, endTime: normalizeTimeInputValue(value) } : item)),
                        }));
                      }}
                    />
                  </Field>
                  <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={period.isEnabled}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setDraft((current) => ({
                          ...current,
                          periods: current.periods.map((item) => (item.id === period.id ? { ...item, isEnabled: checked } : item)),
                        }));
                      }}
                    />
                    有効
                  </label>
                  <button
                    type="button"
                    onClick={() => setDraft((current) => ({ ...current, periods: current.periods.filter((item) => item.id !== period.id) }))}
                    className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-rose-700"
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 border-t border-slate-100 pt-6">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">バックアップと復元</h4>
              <p className="mt-1 text-sm text-slate-500">
                バックアップ ZIP は置き換え復元できます。復元前に現在データをエクスポートしておくと安全です。
              </p>
            </div>

            <input
              ref={importFileInputRef}
              type="file"
              accept=".zip,application/zip"
              onChange={handleImportFileChange}
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
            />

            <div className="flex flex-wrap gap-2">
              <IconButton
                icon={Download}
                tone="light"
                onClick={handleExport}
                disabled={exporting || importing || saving || switchingTerm}
              >
                {exporting ? "バックアップ作成中…" : "バックアップをエクスポート"}
              </IconButton>
              <IconButton
                icon={Upload}
                tone="light"
                onClick={handleOpenImportPicker}
                disabled={exporting || importing || saving || switchingTerm}
              >
                復元 ZIP を選択
              </IconButton>
            </div>

            {exportMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {exportMessage}
              </div>
            ) : null}

            {exportError ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {exportError}
              </div>
            ) : null}

            {!importPreviewState && importError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {importError}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-6">
        <IconButton tone="light" onClick={requestClose} disabled={saving || switchingTerm || importing || Boolean(importPreviewState)}>
          キャンセル
        </IconButton>
        <IconButton
          icon={CheckCircle2}
          onClick={handleSave}
          disabled={saving || switchingTerm || !draft || !isValidStructuredTermKey(draft.currentTermKey.trim()) || termSelectionDirty || draft.currentTermKey.trim() !== loadedPeriodsTermKey}
        >
          保存
        </IconButton>
      </div>

      <ImportBackupModal
        open={Boolean(importPreviewState)}
        preview={importPreviewState}
        importing={importing}
        error={importError}
        onClose={() => {
          importArchiveRef.current = null;
          setImportError("");
          setImportPreviewState(null);
        }}
        onConfirm={handleConfirmImport}
      />
    </Modal>
  );
}
