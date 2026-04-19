import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { DAY_DEFS } from "../../lib/constants";
import {
  deepEqualJson,
  emptySubjectDraft,
  isValidSubjectColor,
  normalizeSubjectColorInput,
  slotKey,
} from "../../lib/utils";
import { Field, IconButton, Modal, TextArea, TextInput } from "../../components/ui";

export function SubjectFormModal({ open, termKey, initialValue, periods, occupiedSlotMap, onClose, onSave }) {
  const [draft, setDraft] = useState(() => emptySubjectDraft(termKey));
  const [initialSnapshot, setInitialSnapshot] = useState(() => emptySubjectDraft(termKey));
  const [colorText, setColorText] = useState("#4f46e5");
  const [initialColorText, setInitialColorText] = useState("#4f46e5");
  const [colorError, setColorError] = useState("");
  const [nameError, setNameError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const nextDraft = {
        ...(initialValue || emptySubjectDraft(termKey)),
        color: normalizeSubjectColorInput(initialValue?.color),
      };
      setDraft(nextDraft);
      setInitialSnapshot(nextDraft);
      setColorText(nextDraft.color);
      setInitialColorText(nextDraft.color);
      setColorError("");
      setNameError("");
    }
  }, [open, initialValue, termKey]);

  const isDirty = !deepEqualJson(draft, initialSnapshot) || colorText !== initialColorText;

  function requestClose() {
    if (saving) return;
    if (isDirty && !window.confirm("未保存の変更があります。破棄しますか？")) return;
    onClose();
  }

  function handleColorTextChange(value) {
    setColorText(value);
    if (isValidSubjectColor(value)) {
      setDraft((current) => ({ ...current, color: normalizeSubjectColorInput(value) }));
      setColorError("");
      return;
    }
    setColorError("授業色は #RRGGBB 形式で入力してください。");
  }

  async function handleSave() {
    if (!draft.name.trim()) {
      setNameError("授業名は必須です。");
      return;
    }
    if (!isValidSubjectColor(colorText)) {
      setColorError("授業色は #RRGGBB 形式で入力してください。");
      return;
    }

    setSaving(true);
    try {
      const { isArchived: _ignoredIsArchived, ...subjectDraft } = draft;
      await onSave({
        ...subjectDraft,
        color: normalizeSubjectColorInput(colorText),
      });
      onClose();
    } catch {
      return;
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title={draft?.id ? "授業を編集" : "授業を追加"}
      maxWidth="max-w-5xl"
    >
      {draft ? (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Field label="授業名">
              <TextInput
                value={draft.name}
                onChange={(event) => {
                  const value = event.target.value;
                  setDraft((current) => ({ ...current, name: value }));
                  if (nameError && value.trim()) setNameError("");
                }}
                placeholder="例: 国際関係論"
              />
              {nameError ? <p className="mt-1 text-xs text-rose-600">{nameError}</p> : null}
            </Field>
            <Field label="教員名">
              <TextInput value={draft.teacherName} onChange={(event) => setDraft((current) => ({ ...current, teacherName: event.target.value }))} placeholder="例: 山田 太郎" />
            </Field>
            <Field label="教室">
              <TextInput value={draft.room} onChange={(event) => setDraft((current) => ({ ...current, room: event.target.value }))} placeholder="例: 3号館 301" />
            </Field>
            <Field label="色">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={draft.color}
                  onChange={(event) => {
                    const nextColor = normalizeSubjectColorInput(event.target.value);
                    setDraft((current) => ({ ...current, color: nextColor }));
                    setColorText(nextColor);
                    setColorError("");
                  }}
                  className="h-12 w-16 rounded-2xl border border-slate-200 bg-white p-1"
                />
                <div className="w-full">
                  <TextInput value={colorText} onChange={(event) => handleColorTextChange(event.target.value)} />
                  {colorError ? <p className="mt-1 text-xs text-rose-600">{colorError}</p> : null}
                </div>
              </div>
            </Field>
            <Field label="メモ">
              <TextArea value={draft.memo} onChange={(event) => setDraft((current) => ({ ...current, memo: event.target.value }))} placeholder="授業の補足、評価方法、連絡事項など" />
            </Field>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">時間割コマの割り当て</h4>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <div className="min-w-[760px] rounded-3xl border border-slate-200 bg-slate-50/50 p-3">
                <div className="grid grid-cols-[180px_repeat(6,minmax(0,1fr))] gap-3">
                  <div className="rounded-2xl bg-white p-3 text-sm font-medium text-slate-500 ring-1 ring-slate-200">コマ / 時間</div>
                  {DAY_DEFS.map((day) => (
                    <div key={day.key} className="rounded-2xl bg-white p-3 text-center text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                      {day.label}
                    </div>
                  ))}
                  {periods.filter((period) => period.isEnabled).map((period) => (
                    <div key={period.id} className="contents">
                      <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                        <p className="text-sm font-semibold text-slate-900">{period.label}</p>
                        <p className="mt-1 text-xs text-slate-500">{period.startTime} - {period.endTime}</p>
                      </div>
                      {DAY_DEFS.map((day) => {
                        const key = slotKey(day.key, period.periodNo);
                        const checked = draft.selectedSlotKeys.includes(key);
                        const owner = occupiedSlotMap.get(key);
                        const occupiedByOther = owner && owner.id !== draft.id;
                        return (
                          <button
                            type="button"
                            key={key}
                            onClick={() => {
                              setDraft((current) => {
                                const next = new Set(current.selectedSlotKeys);
                                if (next.has(key)) next.delete(key);
                                else next.add(key);
                                return { ...current, selectedSlotKeys: [...next] };
                              });
                            }}
                            className={`min-h-[92px] rounded-2xl border p-3 text-left transition ${
                              checked
                                ? "border-slate-900 bg-slate-900 text-white"
                                : occupiedByOther
                                  ? "border-amber-200 bg-amber-50 text-amber-900"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            <p className="text-sm font-medium">{checked ? "選択中" : occupiedByOther ? "使用中" : "空き"}</p>
                            <p className="mt-1 text-xs opacity-80">{occupiedByOther ? owner.name : `${day.label} ${period.label}`}</p>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-6">
        <IconButton tone="light" onClick={requestClose}>
          キャンセル
        </IconButton>
        <IconButton icon={CheckCircle2} onClick={handleSave} disabled={saving}>
          保存
        </IconButton>
      </div>
    </Modal>
  );
}
