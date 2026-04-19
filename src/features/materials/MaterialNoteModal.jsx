import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { deepEqualJson, emptyMaterialMetaDraft } from "../../lib/utils";
import { IconButton, Modal, TextArea } from "../../components/ui";

export function MaterialNoteModal({ open, material, onClose, onSave }) {
  const [draft, setDraft] = useState(emptyMaterialMetaDraft());
  const [initialSnapshot, setInitialSnapshot] = useState(emptyMaterialMetaDraft());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const nextDraft = emptyMaterialMetaDraft(material || {});
      setDraft(nextDraft);
      setInitialSnapshot(nextDraft);
    }
  }, [open, material]);

  const isDirty = !deepEqualJson(draft, initialSnapshot);

  function requestClose() {
    if (saving) return;
    if (isDirty && !window.confirm("未保存の変更があります。破棄しますか？")) return;
    onClose();
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } catch {
      return;
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={requestClose} title="資料メモを編集" subtitle={material?.displayName || ""}>
      <TextArea value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} placeholder="配布資料の補足メモを書けます" className="min-h-[200px]" />
      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-6">
        <IconButton tone="light" onClick={requestClose}>
          キャンセル
        </IconButton>
        <IconButton icon={CheckCircle2} onClick={handleSave}>
          保存
        </IconButton>
      </div>
    </Modal>
  );
}
