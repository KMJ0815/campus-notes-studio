import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { AppShell } from "./app/AppShell";
import { usePwaStatus } from "./app/usePwaStatus";
import { LoadingScreen, ErrorScreen, Modal, ToastViewport, IconButton } from "./components/ui";
import {
  DETAIL_TABS,
  PAGE_DEFS,
} from "./lib/constants";
import { createAppError, errorMessage } from "./lib/errors";
import {
  dayLabelForKey,
  buildSubjectSearchHaystack,
  emptyNoteDraft,
  emptySubjectDraft,
  isValidDateOnly,
  isValidSubjectColor,
  normalizeDateOnlyInputValue,
  normalizeSubjectColorInput,
  slotKey,
  uid,
} from "./lib/utils";
import { ensureSeedData, deleteAppDb, resetDbConnection } from "./db/schema";
import { getSettings, loadTermEditorState, saveSettingsBundle } from "./db/repositories/settings";
import {
  archiveSubject,
  restoreSubject,
  saveSubject,
} from "./db/repositories/subjects";
import { deleteNote, saveNote } from "./db/repositories/notes";
import {
  deleteAttendance,
  getAttendanceSlotOptions,
  saveAttendance,
} from "./db/repositories/attendance";
import { deleteTodo, saveTodo } from "./db/repositories/todos";
import {
  deleteMaterial,
  openMaterial,
  saveMaterialsBatch,
  updateMaterialNote,
} from "./db/repositories/materials";
import { clearMaterialFileStorage } from "./services/materialFileStore";
import {
  loadDashboardSummary,
  loadLibrarySubjects,
  loadSubjectAttendance,
  loadSubjectHeader,
  loadSubjectMaterials,
  loadSubjectNotes,
  loadSubjectTodos,
  loadTodosPageData,
  loadTimetable,
} from "./services/loaders";
import { downloadExportResult, prepareExport } from "./services/exportService";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { TimetablePage } from "./features/timetable/TimetablePage";
import { LibraryPage } from "./features/subjects/LibraryPage";
import { SubjectDetailPanel } from "./features/subjects/SubjectDetailPanel";
import { TodosPage } from "./features/todos/TodosPage";
import { SubjectFormModal } from "./features/subjects/SubjectFormModal";
import { NoteFormModal } from "./features/notes/NoteFormModal";
import { MaterialNoteModal } from "./features/materials/MaterialNoteModal";
import { SettingsModal } from "./features/settings/SettingsModal";

const EMPTY_STATS = {
  activeSubjectsCount: 0,
  notesCount: 0,
  materialsCount: 0,
  attendanceCount: 0,
  openTodosCount: 0,
  todayClasses: [],
  recentNotes: [],
};

const EMPTY_TIMETABLE = { periods: [], slots: [] };
const EMPTY_LIBRARY = { periods: [], activeSubjects: [], archivedSubjects: [] };
const EMPTY_TODOS_PAGE = { openTodos: [], doneTodos: [] };
const EMPTY_TAB_CACHE = { notes: {}, materials: {}, attendance: {}, todos: {} };
const EMPTY_SUBJECT_TAB_REQUESTS = {};
const SUBJECT_TAB_LOADERS = {
  [DETAIL_TABS.notes]: loadSubjectNotes,
  [DETAIL_TABS.materials]: loadSubjectMaterials,
  [DETAIL_TABS.attendance]: loadSubjectAttendance,
  [DETAIL_TABS.todos]: loadSubjectTodos,
};

function createSubjectLoadingDescriptor(subjectId = null, requestId = 0, pending = false) {
  return { subjectId, requestId, pending };
}

function createSubjectTabLoadingState() {
  return {
    [DETAIL_TABS.notes]: createSubjectLoadingDescriptor(),
    [DETAIL_TABS.materials]: createSubjectLoadingDescriptor(),
    [DETAIL_TABS.attendance]: createSubjectLoadingDescriptor(),
    [DETAIL_TABS.todos]: createSubjectLoadingDescriptor(),
  };
}

function describeSlotConflicts(conflicts = []) {
  return conflicts
    .map((conflict) => {
      const suffix = conflict.willBecomeSlotless ? " ※この授業は時間割未割当になります" : "";
      return `${dayLabelForKey(conflict.weekday)} ${conflict.periodNo}限 (${conflict.subjectName})${suffix}`;
    })
    .join("、");
}

function buildBootstrapError(title, error) {
  const detailMessage = error instanceof Error
    ? `${error.name}: ${error.message}${error.stack ? `\n\n${error.stack}` : ""}`
    : String(error);
  return {
    title,
    description: errorMessage(error),
    details: detailMessage,
  };
}

function subjectTabRequestKey(subjectId, tab) {
  return `${subjectId}:${tab}`;
}

function App() {
  const pwaState = usePwaStatus();

  const [ready, setReady] = useState(false);
  const [busyCount, setBusyCount] = useState(0);
  const [page, setPage] = useState(PAGE_DEFS.dashboard);

  const [settings, setSettings] = useState(null);
  const [dashboardSummary, setDashboardSummary] = useState(EMPTY_STATS);
  const [timetableData, setTimetableData] = useState(EMPTY_TIMETABLE);
  const [libraryData, setLibraryData] = useState(EMPTY_LIBRARY);
  const [todoPageData, setTodoPageData] = useState(EMPTY_TODOS_PAGE);

  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [detailTab, setDetailTab] = useState(DETAIL_TABS.notes);
  const [subjectSearch, setSubjectSearch] = useState("");

  const [subjectHeaderCache, setSubjectHeaderCache] = useState({});
  const [subjectTabCache, setSubjectTabCache] = useState(EMPTY_TAB_CACHE);
  const [subjectHeaderLoading, setSubjectHeaderLoading] = useState(() => createSubjectLoadingDescriptor());
  const [subjectTabLoading, setSubjectTabLoading] = useState(() => createSubjectTabLoadingState());

  const [subjectModalState, setSubjectModalState] = useState({ open: false, initialValue: null });
  const [noteModalState, setNoteModalState] = useState({ open: false, initialValue: null, subjectId: null });
  const [settingsModalState, setSettingsModalState] = useState({ open: false, initialTermEditorState: null });
  const [materialModalState, setMaterialModalState] = useState({ open: false, material: null });
  const [exportWarning, setExportWarning] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [bootstrapNonce, setBootstrapNonce] = useState(0);
  const [bootstrapError, setBootstrapError] = useState(null);
  const [showBootstrapErrorDetails, setShowBootstrapErrorDetails] = useState(false);

  const previousTermKeyRef = useRef(null);
  const currentTermKeyRef = useRef("");
  const selectedSubjectIdRef = useRef(null);
  const detailTabRef = useRef(DETAIL_TABS.notes);
  const subjectTabCacheRef = useRef(EMPTY_TAB_CACHE);
  const dashboardRequestRef = useRef(0);
  const timetableRequestRef = useRef(0);
  const libraryRequestRef = useRef(0);
  const todoPageRequestRef = useRef(0);
  const subjectHeaderRequestRef = useRef(0);
  const subjectTabRequestRef = useRef(EMPTY_SUBJECT_TAB_REQUESTS);

  const busy = busyCount > 0;
  const currentTermKey = settings?.currentTermKey || "";

  useEffect(() => {
    currentTermKeyRef.current = currentTermKey;
  }, [currentTermKey]);

  useEffect(() => {
    selectedSubjectIdRef.current = selectedSubjectId;
  }, [selectedSubjectId]);

  useEffect(() => {
    detailTabRef.current = detailTab;
  }, [detailTab]);

  useEffect(() => {
    subjectTabCacheRef.current = subjectTabCache;
  }, [subjectTabCache]);

  const allSubjectsMap = useMemo(() => {
    const map = new Map();
    for (const subject of [...libraryData.activeSubjects, ...libraryData.archivedSubjects]) {
      map.set(subject.id, subject);
    }
    for (const item of timetableData.slots) {
      if (item.subject) {
        map.set(item.subject.id, item.subject);
      }
    }
    Object.values(subjectHeaderCache).forEach((header) => {
      if (header?.subject) map.set(header.subject.id, header.subject);
    });
    dashboardSummary.todayClasses.forEach((item) => {
      if (item.subject) map.set(item.subject.id, item.subject);
    });
    dashboardSummary.recentNotes.forEach((note) => {
      if (note.subject) map.set(note.subject.id, note.subject);
    });
    return map;
  }, [dashboardSummary, libraryData, subjectHeaderCache, timetableData]);

  const occupiedSlotMap = useMemo(() => {
    const map = new Map();
    for (const item of timetableData.slots) {
      if (item.subject && item.slot.activeSlotKey) {
        map.set(slotKey(item.slot.weekday, item.slot.periodNo), item.subject);
      }
    }
    return map;
  }, [timetableData.slots]);

  const visibleLibrarySubjects = useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    if (!q) return libraryData.activeSubjects;
    return libraryData.activeSubjects.filter((subject) => buildSubjectSearchHaystack(subject).includes(q));
  }, [libraryData.activeSubjects, subjectSearch]);

  const selectedHeader = selectedSubjectId ? subjectHeaderCache[selectedSubjectId] || null : null;
  const selectedNotes = selectedSubjectId ? subjectTabCache.notes[selectedSubjectId] || [] : [];
  const selectedMaterials = selectedSubjectId ? subjectTabCache.materials[selectedSubjectId] || [] : [];
  const selectedAttendance = selectedSubjectId ? subjectTabCache.attendance[selectedSubjectId] || [] : [];
  const selectedTodos = selectedSubjectId ? subjectTabCache.todos[selectedSubjectId] || [] : [];

  const currentPeriods = useMemo(() => {
    if (timetableData.periods.length > 0) return timetableData.periods;
    if (libraryData.periods.length > 0) return libraryData.periods;
    return selectedHeader?.periods || [];
  }, [libraryData.periods, selectedHeader?.periods, timetableData.periods]);

  const dismissToast = useCallback((toastId) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }, []);

  const pushToast = useCallback(
    ({ tone = "info", title, description, duration = 4200 }) => {
      const toastId = uid();
      setToasts((current) => [...current, { id: toastId, tone, title, description }]);
      window.setTimeout(() => dismissToast(toastId), duration);
    },
    [dismissToast],
  );

  const withBusy = useCallback(async (fn) => {
    setBusyCount((count) => count + 1);
    try {
      return await fn();
    } finally {
      setBusyCount((count) => count - 1);
    }
  }, []);

  const handleKnownError = useCallback(
    (error, fallbackTitle = "処理に失敗しました。") => {
      if (error?.code === "CANCELLED") return;
      pushToast({
        tone: "warning",
        title: fallbackTitle,
        description: errorMessage(error),
      });
    },
    [pushToast],
  );

  const retryBootstrap = useCallback(() => {
    currentTermKeyRef.current = "";
    selectedSubjectIdRef.current = null;
    detailTabRef.current = DETAIL_TABS.notes;
    dashboardRequestRef.current += 1;
    timetableRequestRef.current += 1;
    libraryRequestRef.current += 1;
    todoPageRequestRef.current += 1;
    subjectHeaderRequestRef.current += 1;
    subjectTabRequestRef.current = {};
    setReady(false);
    setPage(PAGE_DEFS.dashboard);
    setBootstrapError(null);
    setShowBootstrapErrorDetails(false);
    setSettings(null);
    setDashboardSummary(EMPTY_STATS);
    setTimetableData(EMPTY_TIMETABLE);
    setLibraryData(EMPTY_LIBRARY);
    setTodoPageData(EMPTY_TODOS_PAGE);
    setSubjectSearch("");
    setSubjectModalState({ open: false, initialValue: null });
    setNoteModalState({ open: false, initialValue: null, subjectId: null });
    setSettingsModalState({ open: false, initialTermEditorState: null });
    setMaterialModalState({ open: false, material: null });
    setExportWarning(null);
    setSelectedSubjectId(null);
    setDetailTab(DETAIL_TABS.notes);
    setSubjectHeaderCache({});
    setSubjectTabCache(EMPTY_TAB_CACHE);
    setSubjectHeaderLoading(createSubjectLoadingDescriptor());
    setSubjectTabLoading(createSubjectTabLoadingState());
    previousTermKeyRef.current = null;
    setBootstrapNonce((value) => value + 1);
  }, []);

  const handleResetLocalDb = useCallback(async () => {
    try {
      await withBusy(async () => {
        await clearMaterialFileStorage();
        await deleteAppDb();
        resetDbConnection();
      });
      retryBootstrap();
    } catch (error) {
      setBootstrapError(buildBootstrapError("ローカルDBのリセットに失敗しました。", error));
    }
  }, [retryBootstrap, withBusy]);

  const refreshDashboard = useCallback(
    async (termKey) => {
      if (!termKey) return;
      const requestId = dashboardRequestRef.current + 1;
      dashboardRequestRef.current = requestId;
      const summary = await loadDashboardSummary(termKey);
      if (dashboardRequestRef.current !== requestId || currentTermKeyRef.current !== termKey) {
        return null;
      }
      setDashboardSummary(summary);
      return summary;
    },
    [],
  );

  const refreshTimetable = useCallback(
    async (termKey) => {
      if (!termKey) return;
      const requestId = timetableRequestRef.current + 1;
      timetableRequestRef.current = requestId;
      const data = await loadTimetable(termKey);
      if (timetableRequestRef.current !== requestId || currentTermKeyRef.current !== termKey) {
        return null;
      }
      setTimetableData(data);
      return data;
    },
    [],
  );

  const refreshLibrary = useCallback(
    async (termKey) => {
      if (!termKey) return;
      const requestId = libraryRequestRef.current + 1;
      libraryRequestRef.current = requestId;
      const data = await loadLibrarySubjects(termKey);
      if (libraryRequestRef.current !== requestId || currentTermKeyRef.current !== termKey) {
        return null;
      }
      setLibraryData(data);
      return data;
    },
    [],
  );

  const refreshTodosPage = useCallback(
    async (termKey) => {
      if (!termKey) return;
      const requestId = todoPageRequestRef.current + 1;
      todoPageRequestRef.current = requestId;
      const data = await loadTodosPageData(termKey);
      if (todoPageRequestRef.current !== requestId || currentTermKeyRef.current !== termKey) {
        return null;
      }
      setTodoPageData(data);
      return data;
    },
    [],
  );

  const refreshSubjectHeader = useCallback(async (subjectId) => {
    if (!subjectId) return null;
    const requestId = subjectHeaderRequestRef.current + 1;
    subjectHeaderRequestRef.current = requestId;
    setSubjectHeaderLoading(createSubjectLoadingDescriptor(subjectId, requestId, true));
    try {
      const header = await loadSubjectHeader(subjectId);
      if (subjectHeaderRequestRef.current !== requestId) return header;
      if (!header) {
        if (selectedSubjectIdRef.current === subjectId) {
          setSubjectHeaderCache((current) => {
            const next = { ...current };
            delete next[subjectId];
            return next;
          });
        }
        return null;
      }
      if (selectedSubjectIdRef.current === subjectId) {
        setSubjectHeaderCache((current) => ({ ...current, [subjectId]: header }));
      }
      return header;
    } finally {
      if (subjectHeaderRequestRef.current === requestId) {
        setSubjectHeaderLoading((current) => (
          current.requestId === requestId
            ? createSubjectLoadingDescriptor(current.subjectId, current.requestId, false)
            : current
        ));
      }
    }
  }, []);

  const refreshSubjectTab = useCallback(async (subjectId, tab, { force = true } = {}) => {
    if (!subjectId) return;
    const cachedData = subjectTabCacheRef.current[tab]?.[subjectId];
    if (!force && cachedData) return cachedData;

    const requestKey = subjectTabRequestKey(subjectId, tab);
    const requestId = (subjectTabRequestRef.current[requestKey] || 0) + 1;
    subjectTabRequestRef.current = {
      ...subjectTabRequestRef.current,
      [requestKey]: requestId,
    };
    if (selectedSubjectIdRef.current === subjectId && detailTabRef.current === tab) {
      setSubjectTabLoading((current) => ({
        ...current,
        [tab]: createSubjectLoadingDescriptor(subjectId, requestId, true),
      }));
    }
    try {
      const loader = SUBJECT_TAB_LOADERS[tab];
      const data = loader ? await loader(subjectId) : [];
      if (subjectTabRequestRef.current[requestKey] !== requestId) return data;
      setSubjectTabCache((current) => ({
        ...current,
        [tab]: {
          ...current[tab],
          [subjectId]: data,
        },
      }));
      return data;
    } finally {
      if (
        subjectTabRequestRef.current[requestKey] === requestId
        && selectedSubjectIdRef.current === subjectId
        && detailTabRef.current === tab
      ) {
        setSubjectTabLoading((current) => ({
          ...current,
          [tab]: current[tab].requestId === requestId
            ? createSubjectLoadingDescriptor(current[tab].subjectId, current[tab].requestId, false)
            : current[tab],
        }));
      }
    }
  }, []);

  const refreshSelectedSubjectSlice = useCallback(
    async (subjectId, options = {}) => {
      if (!subjectId) return;
      await refreshSubjectHeader(subjectId);
      if (options.notes) {
        await refreshSubjectTab(subjectId, DETAIL_TABS.notes);
      }
      if (options.materials) {
        await refreshSubjectTab(subjectId, DETAIL_TABS.materials);
      }
      if (options.attendance) {
        await refreshSubjectTab(subjectId, DETAIL_TABS.attendance);
      }
      if (options.todos) {
        await refreshSubjectTab(subjectId, DETAIL_TABS.todos);
      }
    },
    [refreshSubjectHeader, refreshSubjectTab],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setBootstrapError(null);
        setShowBootstrapErrorDetails(false);
        setReady(false);
        await ensureSeedData();
        const nextSettings = await getSettings();
        if (!cancelled) {
          setSettings(nextSettings);
        }
      } catch (error) {
        if (!cancelled) {
          setBootstrapError(buildBootstrapError("アプリを初期化できませんでした。", error));
          setReady(false);
          setSettings(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrapNonce]);

  useEffect(() => {
    if (!settings?.currentTermKey) return;
    let cancelled = false;
    const previousTermKey = previousTermKeyRef.current;
    if (previousTermKey && previousTermKey !== settings.currentTermKey) {
      setSelectedSubjectId(null);
      selectedSubjectIdRef.current = null;
      setSubjectHeaderCache({});
      setSubjectTabCache(EMPTY_TAB_CACHE);
      setSubjectHeaderLoading(createSubjectLoadingDescriptor());
      setSubjectTabLoading(createSubjectTabLoadingState());
    }
    previousTermKeyRef.current = settings.currentTermKey;

    (async () => {
      try {
        await Promise.all([
          refreshDashboard(settings.currentTermKey),
          refreshTimetable(settings.currentTermKey),
          refreshLibrary(settings.currentTermKey),
          refreshTodosPage(settings.currentTermKey),
        ]);
        if (!cancelled) {
          setBootstrapError(null);
          setReady(true);
        }
      } catch (error) {
        if (!cancelled) {
          setBootstrapError(buildBootstrapError("初期データの読み込みに失敗しました。", error));
          setReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshDashboard, refreshLibrary, refreshTimetable, refreshTodosPage, settings?.currentTermKey]);

  useEffect(() => {
    if (!selectedSubjectId) return;
    const targetSubjectId = selectedSubjectId;
    refreshSubjectHeader(targetSubjectId).then((header) => {
      if (selectedSubjectIdRef.current !== targetSubjectId) return;
      if (header?.subject?.termKey !== currentTermKey) {
        setSelectedSubjectId(null);
        selectedSubjectIdRef.current = null;
      }
    }).catch((error) => {
      if (selectedSubjectIdRef.current !== targetSubjectId) return;
      handleKnownError(error, "授業詳細の読み込みに失敗しました。");
    });
  }, [currentTermKey, handleKnownError, refreshSubjectHeader, selectedSubjectId]);

  useEffect(() => {
    if (!selectedSubjectId) return;
    const targetSubjectId = selectedSubjectId;
    const targetTab = detailTab;
    refreshSubjectTab(targetSubjectId, targetTab, { force: false }).catch((error) => {
      if (selectedSubjectIdRef.current !== targetSubjectId || detailTabRef.current !== targetTab) return;
      handleKnownError(error, "タブデータの読み込みに失敗しました。");
    });
  }, [detailTab, handleKnownError, refreshSubjectTab, selectedSubjectId]);

  useEffect(() => {
    if (!pwaState.updateAvailable) return;
    pushToast({
      tone: "info",
      title: "新しいバージョンがあります。",
      description: "PWA 状態カードから更新を適用できます。",
      duration: 30000,
    });
  }, [pwaState.updateAvailable, pushToast]);

  function openCreateSubject(prefill = {}) {
    setSubjectModalState({
      open: true,
      initialValue: {
        ...emptySubjectDraft(currentTermKey),
        ...prefill,
        color: normalizeSubjectColorInput(prefill.color),
      },
    });
  }

  function openEditSubject(subject) {
    setSubjectModalState({
      open: true,
      initialValue: {
        id: subject.id,
        baseUpdatedAt: subject.updatedAt,
        termKey: subject.termKey,
        name: subject.name || "",
        teacherName: subject.teacherName || "",
        room: subject.room || "",
        color: normalizeSubjectColorInput(subject.color),
        memo: subject.memo || "",
        selectedSlotKeys: (subject.slots || selectedHeader?.slots || []).map((slot) => slotKey(slot.weekday, slot.periodNo)),
      },
    });
  }

  function closeSubjectModal() {
    setSubjectModalState({ open: false, initialValue: null });
  }

  function openCreateNote(subjectId) {
    setNoteModalState({
      open: true,
      subjectId,
      initialValue: emptyNoteDraft(subjectId),
    });
  }

  function openEditNote(note) {
    setNoteModalState({
      open: true,
      subjectId: note.subjectId,
      initialValue: {
        id: note.id,
        baseUpdatedAt: note.updatedAt,
        subjectId: note.subjectId,
        title: note.title || "",
        bodyText: note.bodyText || "",
        lectureDate: normalizeDateOnlyInputValue(note.lectureDate),
      },
    });
  }

  function closeNoteModal() {
    setNoteModalState({ open: false, initialValue: null, subjectId: null });
  }

  const closeSettingsModal = useCallback(() => {
    setSettingsModalState({ open: false, initialTermEditorState: null });
  }, []);

  const openSettingsModal = useCallback(async () => {
    if (!currentTermKey) return;
    try {
      const initialTermEditorState = await loadTermEditorState(currentTermKey);
      setSettingsModalState({ open: true, initialTermEditorState });
    } catch (error) {
      handleKnownError(error, "設定の読み込みに失敗しました。");
    }
  }, [currentTermKey, handleKnownError]);

  const handleImportApplied = useCallback((result) => {
    pushToast({
      tone: "success",
      title: "バックアップを復元しました。",
      description: result?.warnings?.length
        ? `資料ファイル ${result.warnings.length} 件は欠損のまま復元されました。`
        : undefined,
    });
    retryBootstrap();
  }, [pushToast, retryBootstrap]);

  const handleSelectSubject = useCallback((subjectId) => {
    selectedSubjectIdRef.current = subjectId;
    detailTabRef.current = DETAIL_TABS.notes;
    setSelectedSubjectId(subjectId);
    setDetailTab(DETAIL_TABS.notes);
    setPage(PAGE_DEFS.timetable);
  }, []);

  const handleSelectSubjectTodos = useCallback((subjectId) => {
    selectedSubjectIdRef.current = subjectId;
    detailTabRef.current = DETAIL_TABS.todos;
    setSelectedSubjectId(subjectId);
    setDetailTab(DETAIL_TABS.todos);
    setPage(PAGE_DEFS.timetable);
  }, []);

  async function handleSaveSubject(draft) {
    if (!draft.name.trim()) {
      const error = createAppError("INVALID_SUBJECT", "授業名は必須です。");
      handleKnownError(error, "授業を保存できませんでした。");
      throw error;
    }
    if (!isValidSubjectColor(draft.color)) {
      const error = createAppError("INVALID_SUBJECT_COLOR", "授業色は #RRGGBB 形式で入力してください。");
      handleKnownError(error, "授業を保存できませんでした。");
      throw error;
    }

    let savedSubject;
    let overwriteConflictImpacts = [];
    try {
      savedSubject = await withBusy(() => saveSubject({ ...draft, termKey: draft.termKey || currentTermKey }, { overwriteConflicts: false }));
    } catch (error) {
      if (error?.code === "SLOT_CONFLICT") {
        const confirmed = window.confirm(`次のコマは既に使用中です。上書きしますか？\n${describeSlotConflicts(error.data?.conflicts)}`);
        if (!confirmed) {
          throw createAppError("CANCELLED", "");
        }
        overwriteConflictImpacts = error.data?.conflicts || [];
        savedSubject = await withBusy(() => saveSubject({ ...draft, termKey: draft.termKey || currentTermKey }, { overwriteConflicts: true }));
      } else if (error?.code === "INVALID_SLOT_SELECTION" || error?.code === "INVALID_SUBJECT" || error?.code === "INVALID_SUBJECT_COLOR" || error?.code === "ARCHIVE_VIA_ACTION_REQUIRED") {
        handleKnownError(error, "授業を保存できませんでした。");
        throw error;
      } else if (error?.code === "STALE_DRAFT" || error?.code === "STALE_UPDATE") {
        await Promise.all([
          refreshDashboard(currentTermKey),
          refreshTimetable(currentTermKey),
          refreshLibrary(currentTermKey),
          refreshTodosPage(currentTermKey),
        ]);
        handleKnownError(
          createAppError(error.code, "この授業は別の画面で更新または削除されています。授業一覧を開き直してから編集してください。"),
          "授業を保存できませんでした。",
        );
        throw error;
      } else {
        handleKnownError(error, "授業の保存に失敗しました。");
        throw error;
      }
    }

    selectedSubjectIdRef.current = savedSubject.id;
    setSelectedSubjectId(savedSubject.id);
    await Promise.all([
      refreshDashboard(currentTermKey),
      refreshTimetable(currentTermKey),
      refreshLibrary(currentTermKey),
      refreshTodosPage(currentTermKey),
      refreshSelectedSubjectSlice(savedSubject.id),
    ]);
    pushToast({ tone: "success", title: "授業を保存しました。" });
    if (overwriteConflictImpacts.some((conflict) => conflict.willBecomeSlotless)) {
      const affectedSubjects = [...new Set(overwriteConflictImpacts.filter((conflict) => conflict.willBecomeSlotless).map((conflict) => conflict.subjectName))];
      pushToast({
        tone: "warning",
        title: "一部の授業が時間割未割当になりました。",
        description: affectedSubjects.join("、"),
      });
    }
  }

  async function handleArchiveSubject(subject) {
    if (!window.confirm(`「${subject.name}」をアーカイブします。時間割からは消えますが、ノートや資料は保持されます。`)) return;
    try {
      await withBusy(() => archiveSubject(subject.id));
      await Promise.all([refreshDashboard(currentTermKey), refreshTimetable(currentTermKey), refreshLibrary(currentTermKey), refreshTodosPage(currentTermKey)]);
      if (selectedSubjectId === subject.id) {
        setSelectedSubjectId(null);
      }
      pushToast({ tone: "success", title: "授業をアーカイブしました。" });
    } catch (error) {
      handleKnownError(error, "アーカイブに失敗しました。");
    }
  }

  async function handleRestoreSubject(subject) {
    try {
      const result = await withBusy(() => restoreSubject(subject.id));
      await Promise.all([refreshDashboard(currentTermKey), refreshTimetable(currentTermKey), refreshLibrary(currentTermKey), refreshTodosPage(currentTermKey)]);
      if (result.restoredSlotCount === 0) {
        const latestHeader = await refreshSubjectHeader(subject.id);
        pushToast({
          tone: "warning",
          title: "授業一覧へ戻しましたが、時間割コマは未設定です。",
          description: "コマを設定してから使い始めてください。",
        });
        openEditSubject({
          ...(result.subject || subject),
          ...(latestHeader?.subject || {}),
          slots: latestHeader?.slots || [],
        });
        return;
      }
      pushToast({ tone: "success", title: "授業を復元しました。" });
    } catch (error) {
      if (error?.code === "RESTORE_CONFLICT") {
        handleKnownError(
          createAppError("RESTORE_CONFLICT", `復元先の時間割が埋まっています。${describeSlotConflicts(error.data?.conflicts)}`),
          "授業を復元できませんでした。",
        );
        return;
      }
      if (error?.code === "RESTORE_PERIOD_DISABLED") {
        handleKnownError(error, "授業を復元できませんでした。");
        return;
      }
      handleKnownError(error, "授業の復元に失敗しました。");
    }
  }

  async function handleSaveNote(draft) {
    const lectureDate = normalizeDateOnlyInputValue(draft.lectureDate);
    if (!draft.title.trim() && !draft.bodyText.trim()) {
      const error = createAppError("INVALID_NOTE", "タイトルか本文のどちらかを入力してください。");
      handleKnownError(error, "ノートを保存できませんでした。");
      throw error;
    }
    if (!isValidDateOnly(lectureDate)) {
      const error = createAppError("INVALID_NOTE_DATE", "講義日は必須です。正しい日付を入力してください。");
      handleKnownError(error, "ノートを保存できませんでした。");
      throw error;
    }
    const nextDraft = { ...draft, lectureDate };
    try {
      await withBusy(() => saveNote(nextDraft));
      await Promise.all([
        refreshDashboard(currentTermKey),
        refreshSelectedSubjectSlice(nextDraft.subjectId, { notes: true }),
      ]);
      pushToast({ tone: "success", title: "ノートを保存しました。" });
    } catch (error) {
      if (error?.code === "STALE_DRAFT" || error?.code === "STALE_UPDATE") {
        await Promise.all([
          refreshDashboard(currentTermKey),
          refreshSelectedSubjectSlice(nextDraft.subjectId, { notes: true }),
        ]);
        handleKnownError(
          createAppError(error.code, "このノートは別の画面で更新または削除されています。開き直してから編集してください。"),
          "ノートを保存できませんでした。",
        );
        throw error;
      }
      handleKnownError(error, "ノートの保存に失敗しました。");
      throw error;
    }
  }

  async function handleDeleteNote(note) {
    const noteTitle = note.title?.trim() || "無題ノート";
    if (!window.confirm(`「${noteTitle}」を削除しますか？`)) return;
    try {
      await withBusy(() => deleteNote(note.id));
      await Promise.all([
        refreshDashboard(currentTermKey),
        refreshSelectedSubjectSlice(note.subjectId, { notes: true }),
      ]);
      if (noteModalState.initialValue?.id === note.id) {
        closeNoteModal();
      }
      pushToast({ tone: "success", title: "ノートを削除しました。" });
    } catch (error) {
      if (error?.code === "STALE_DRAFT") {
        closeNoteModal();
        await Promise.all([
          refreshDashboard(currentTermKey),
          refreshSelectedSubjectSlice(note.subjectId, { notes: true }),
        ]);
        handleKnownError(error, "ノートは既に削除されています。");
        return;
      }
      handleKnownError(error, "ノートの削除に失敗しました。");
    }
  }

  async function handleUploadMaterials(files) {
    if (!selectedSubjectId || files.length === 0) return;
    try {
      await withBusy(() => saveMaterialsBatch(selectedSubjectId, files, ""));
      await Promise.all([
        refreshDashboard(currentTermKey),
        refreshSelectedSubjectSlice(selectedSubjectId, { materials: true }),
      ]);
      pushToast({ tone: "success", title: `${files.length} 件の資料を保存しました。` });
    } catch (error) {
      handleKnownError(error, "資料の保存に失敗しました。");
    }
  }

  async function handleOpenMaterial(meta) {
    try {
      const result = await openMaterial(meta);
      if (result?.blocked) {
        pushToast({
          tone: "warning",
          title: "プレビューを開けなかったため、ダウンロードに切り替えました。",
          description: "ブラウザのポップアップ制限により新しいタブを開けませんでした。",
        });
      }
    } catch (error) {
      handleKnownError(error, "資料を開けませんでした。");
    }
  }

  async function handleDeleteMaterial(meta) {
    if (!window.confirm(`資料「${meta.displayName}」を削除しますか？`)) return;
    try {
      const result = await withBusy(() => deleteMaterial(meta.id));
      await Promise.all([
        refreshDashboard(currentTermKey),
        refreshSelectedSubjectSlice(meta.subjectId, { materials: true }),
      ]);
      pushToast({
        tone: result.cleanupWarning ? "warning" : "success",
        title: "資料を削除しました。",
        description: result.cleanupWarning
          ? result.cleanupError
            ? `実ファイルの削除に失敗しましたが、資料情報は削除しました。(${result.cleanupError})`
            : "実ファイルは既に見つかりませんでしたが、資料情報は削除しました。"
          : "",
      });
    } catch (error) {
      if (error?.code === "STALE_DRAFT") {
        if (materialModalState.material?.id === meta.id) {
          setMaterialModalState({ open: false, material: null });
        }
        await Promise.all([
          refreshDashboard(currentTermKey),
          refreshSelectedSubjectSlice(meta.subjectId, { materials: true }),
        ]);
        handleKnownError(error, "資料は既に削除されています。");
        return;
      }
      handleKnownError(error, "資料の削除に失敗しました。");
    }
  }

  async function handleSaveMaterialNote(draft) {
    try {
      await withBusy(() => updateMaterialNote(draft.id, draft.note, draft.baseUpdatedAt));
      if (selectedSubjectId) {
        await refreshSelectedSubjectSlice(selectedSubjectId, { materials: true });
      }
      pushToast({ tone: "success", title: "資料メモを保存しました。" });
    } catch (error) {
      if (error?.code === "STALE_DRAFT" || error?.code === "STALE_UPDATE") {
        if (selectedSubjectId) {
          await refreshSelectedSubjectSlice(selectedSubjectId, { materials: true });
        }
        handleKnownError(
          createAppError(error.code, "この資料メモは別の画面で更新または削除されています。開き直してから編集してください。"),
          "資料メモを保存できませんでした。",
        );
        throw error;
      }
      handleKnownError(error, "資料メモの保存に失敗しました。");
      throw error;
    }
  }

  async function handleSaveAttendance(draft) {
    try {
      await withBusy(() => saveAttendance(draft));
      await Promise.all([
        refreshDashboard(currentTermKey),
        refreshSelectedSubjectSlice(draft.subjectId, { attendance: true }),
      ]);
      pushToast({ tone: "success", title: "出席を保存しました。" });
    } catch (error) {
      if (error?.code === "STALE_DRAFT" || error?.code === "STALE_UPDATE") {
        await Promise.all([
          refreshDashboard(currentTermKey),
          refreshSelectedSubjectSlice(draft.subjectId, { attendance: true }),
        ]);
        handleKnownError(
          createAppError(error.code, "この出席記録は別の画面で更新または削除されています。開き直してから編集してください。"),
          "出席を保存できませんでした。",
        );
        throw error;
      }
      if (error?.code === "ATTENDANCE_SLOT_REQUIRED") {
        handleKnownError(createAppError("ATTENDANCE_SLOT_REQUIRED", "同じ日に複数コマがあるため、該当コマの選択が必要です。"), "出席を保存できませんでした。");
      } else if (error?.code === "ATTENDANCE_DUPLICATE") {
        handleKnownError(
          createAppError("ATTENDANCE_DUPLICATE", "その日・そのコマの記録は既にあります。既存記録を編集するか、先に削除してください。"),
          "出席を保存できませんでした。",
        );
      } else {
        handleKnownError(error, "出席の保存に失敗しました。");
      }
      throw error;
    }
  }

  async function handleDeleteAttendance(record) {
    if (!window.confirm(`${record.lectureDate} の出席記録を削除しますか？`)) return;
    try {
      await withBusy(() => deleteAttendance(record.id));
      await Promise.all([
        refreshDashboard(currentTermKey),
        refreshSelectedSubjectSlice(record.subjectId, { attendance: true }),
      ]);
      pushToast({ tone: "success", title: "出席記録を削除しました。" });
    } catch (error) {
      if (error?.code === "STALE_DRAFT") {
        await Promise.all([
          refreshDashboard(currentTermKey),
          refreshSelectedSubjectSlice(record.subjectId, { attendance: true }),
        ]);
        handleKnownError(error, "出席記録は既に削除されています。");
        return;
      }
      handleKnownError(error, "出席記録の削除に失敗しました。");
    }
  }

  async function handleSaveTodo(draft) {
    try {
      await withBusy(() => saveTodo(draft));
      await Promise.all([
        refreshDashboard(currentTermKey),
        refreshTimetable(currentTermKey),
        refreshTodosPage(currentTermKey),
        refreshSelectedSubjectSlice(draft.subjectId, { todos: true }),
      ]);
      pushToast({ tone: "success", title: "ToDo を保存しました。" });
    } catch (error) {
      if (error?.code === "STALE_DRAFT" || error?.code === "STALE_UPDATE") {
        await Promise.all([
          refreshDashboard(currentTermKey),
          refreshTimetable(currentTermKey),
          refreshTodosPage(currentTermKey),
          refreshSelectedSubjectSlice(draft.subjectId, { todos: true }),
        ]);
        handleKnownError(
          createAppError(error.code, "この ToDo は別の画面で更新または削除されています。開き直してから編集してください。"),
          "ToDo を保存できませんでした。",
        );
        throw error;
      }
      handleKnownError(error, "ToDo の保存に失敗しました。");
      throw error;
    }
  }

  async function handleDeleteTodo(todo) {
    const todoTitle = todo.title?.trim() || "無題ToDo";
    if (!window.confirm(`「${todoTitle}」を削除しますか？`)) {
      return { status: "cancelled" };
    }
    try {
      await withBusy(() => deleteTodo(todo.id));
      await Promise.all([
        refreshDashboard(currentTermKey),
        refreshTimetable(currentTermKey),
        refreshTodosPage(currentTermKey),
        refreshSelectedSubjectSlice(todo.subjectId, { todos: true }),
      ]);
      pushToast({ tone: "success", title: "ToDo を削除しました。" });
      return { status: "deleted" };
    } catch (error) {
      if (error?.code === "STALE_DRAFT") {
        await Promise.all([
          refreshDashboard(currentTermKey),
          refreshTimetable(currentTermKey),
          refreshTodosPage(currentTermKey),
          refreshSelectedSubjectSlice(todo.subjectId, { todos: true }),
        ]);
        handleKnownError(error, "ToDo は既に削除されています。");
        return { status: "stale" };
      }
      handleKnownError(error, "ToDo の削除に失敗しました。");
      throw error;
    }
  }

  async function handleSaveSettings({ draft, periodsLoadedForTermKey }) {
    if (!draft.currentTermKey.trim()) {
      throw createAppError("INVALID_SETTINGS", "内部学期キーは必須です。");
    }

    try {
      await withBusy(() =>
        saveSettingsBundle({
          draftSettings: draft,
          draftPeriods: draft.periods,
          periodsLoadedForTermKey,
        }),
      );
      const nextSettings = await getSettings();
      setSettings(nextSettings);
      await Promise.all([
        refreshDashboard(nextSettings.currentTermKey),
        refreshTimetable(nextSettings.currentTermKey),
        refreshLibrary(nextSettings.currentTermKey),
        refreshTodosPage(nextSettings.currentTermKey),
      ]);
      if (selectedSubjectId && draft.currentTermKey.trim() === currentTermKey) {
        await refreshSelectedSubjectSlice(selectedSubjectId);
      }
      pushToast({ tone: "success", title: "設定を保存しました。" });
    } catch (error) {
      if (error?.code === "STALE_UPDATE") {
        const nextSettings = await getSettings();
        setSettings(nextSettings);
        await Promise.all([
          refreshDashboard(nextSettings.currentTermKey),
          refreshTimetable(nextSettings.currentTermKey),
          refreshLibrary(nextSettings.currentTermKey),
          refreshTodosPage(nextSettings.currentTermKey),
        ]);
        handleKnownError(error, "設定は別の画面で更新されています。");
        throw error;
      }
      handleKnownError(error, "設定の保存に失敗しました。");
      throw error;
    }
  }

  async function handleExport(allowMissingFiles = false) {
    try {
      const result = await withBusy(() => prepareExport({ allowMissingFiles }));
      if (result.status === "missing_files") {
        setExportWarning(result);
        return;
      }
      downloadExportResult(result);
      setExportWarning(null);
      pushToast({
        tone: result.missingFiles?.length ? "warning" : "success",
        title: result.missingFiles?.length ? "欠損を除いてエクスポートしました。" : "エクスポートを開始しました。",
        description: result.missingFiles?.length ? `${result.missingFiles.length} 件の資料が欠損していました。` : "",
      });
    } catch (error) {
      handleKnownError(error, "エクスポートに失敗しました。");
    }
  }

  if (bootstrapError) {
    return (
      <ErrorScreen
        title={bootstrapError.title}
        description={bootstrapError.description}
        details={bootstrapError.details}
        showDetails={showBootstrapErrorDetails}
        onToggleDetails={() => setShowBootstrapErrorDetails((current) => !current)}
        onRetry={retryBootstrap}
        onReset={handleResetLocalDb}
        busy={busy}
      />
    );
  }

  if (!ready || !settings) {
    return <LoadingScreen />;
  }

  const handleMaterialPickerError = () => {
    pushToast({
      tone: "warning",
      title: "ファイル選択を開けませんでした。",
      description: "ブラウザの設定を確認してから、もう一度お試しください。",
    });
  };

  const handleMaterialPickerOpen = () => {
    pushToast({
      tone: "info",
      title: "ファイル選択ダイアログを開いています…",
      duration: 1600,
    });
  };

  const activeHeaderLoading = Boolean(selectedSubjectId)
    && subjectHeaderLoading.pending
    && subjectHeaderLoading.subjectId === selectedSubjectId;
  const activeTabLoading = Boolean(selectedSubjectId)
    && subjectTabLoading[detailTab]?.pending
    && subjectTabLoading[detailTab]?.subjectId === selectedSubjectId;

  return (
    <>
      <AppShell
        page={page}
        onPageChange={setPage}
        settings={settings}
        busy={busy}
        stats={dashboardSummary}
        pwaState={pwaState}
        onCreateSubject={() => openCreateSubject()}
        onOpenSettings={openSettingsModal}
        onExport={() => handleExport(false)}
      >
        {page === PAGE_DEFS.dashboard ? (
          <DashboardPage
            summary={dashboardSummary}
            onOpenTimetable={() => setPage(PAGE_DEFS.timetable)}
            onOpenSubject={handleSelectSubject}
            onEditRecentNote={(note) => {
              handleSelectSubject(note.subjectId);
              openEditNote(note);
            }}
          />
        ) : null}

        {page === PAGE_DEFS.timetable ? (
          <TimetablePage
            periods={timetableData.periods}
            slotItems={timetableData.slots}
            onSelectSubject={handleSelectSubject}
            onCreateSubject={(selectedSlotKeys) => openCreateSubject({ selectedSlotKeys })}
            onOpenSettings={openSettingsModal}
            onExport={() => handleExport(false)}
            detailPanel={
              <SubjectDetailPanel
                header={selectedHeader}
                detailTab={detailTab}
                tabLoading={activeHeaderLoading || activeTabLoading}
                notes={selectedNotes}
                materials={selectedMaterials}
                attendance={selectedAttendance}
                todos={selectedTodos}
                onChangeTab={setDetailTab}
                onEditSubject={openEditSubject}
                onArchiveSubject={handleArchiveSubject}
                onCreateNote={openCreateNote}
                onEditNote={openEditNote}
                onDeleteNote={handleDeleteNote}
                onUploadMaterials={handleUploadMaterials}
                onOpenMaterial={handleOpenMaterial}
                onEditMaterial={(material) => setMaterialModalState({ open: true, material })}
                onDeleteMaterial={handleDeleteMaterial}
                onMaterialPickerError={handleMaterialPickerError}
                onMaterialPickerOpen={handleMaterialPickerOpen}
                onSaveAttendance={handleSaveAttendance}
                onDeleteAttendance={handleDeleteAttendance}
                loadAttendanceSlotOptions={getAttendanceSlotOptions}
                onSaveTodo={handleSaveTodo}
                onDeleteTodo={handleDeleteTodo}
              />
            }
          />
        ) : null}

        {page === PAGE_DEFS.library ? (
          <LibraryPage
            activeSubjects={visibleLibrarySubjects}
            archivedSubjects={libraryData.archivedSubjects}
            periods={libraryData.periods}
            search={subjectSearch}
            onSearchChange={setSubjectSearch}
            onSelectSubject={handleSelectSubject}
            onEditSubject={openEditSubject}
            onArchiveSubject={handleArchiveSubject}
            onRestoreSubject={handleRestoreSubject}
            onCreateSubject={() => openCreateSubject()}
          />
        ) : null}

        {page === PAGE_DEFS.todos ? (
          <TodosPage
            openTodos={todoPageData.openTodos}
            doneTodos={todoPageData.doneTodos}
            onOpenSubject={handleSelectSubjectTodos}
            onSaveTodo={handleSaveTodo}
            onDeleteTodo={handleDeleteTodo}
          />
        ) : null}
      </AppShell>

      <SubjectFormModal
        open={subjectModalState.open}
        termKey={currentTermKey}
        initialValue={subjectModalState.initialValue}
        periods={currentPeriods}
        occupiedSlotMap={occupiedSlotMap}
        onClose={closeSubjectModal}
        onSave={handleSaveSubject}
      />

      <NoteFormModal
        open={noteModalState.open}
        subject={allSubjectsMap.get(noteModalState.subjectId) || selectedHeader?.subject || null}
        initialValue={noteModalState.initialValue}
        onClose={closeNoteModal}
        onSave={handleSaveNote}
      />

      <MaterialNoteModal
        open={materialModalState.open}
        material={materialModalState.material}
        onClose={() => setMaterialModalState({ open: false, material: null })}
        onSave={handleSaveMaterialNote}
      />

      <SettingsModal
        open={settingsModalState.open}
        initialSettings={settings}
        initialTermEditorState={settingsModalState.initialTermEditorState}
        loadTermEditorState={loadTermEditorState}
        onClose={closeSettingsModal}
        onSave={handleSaveSettings}
        onImportApplied={handleImportApplied}
      />

      <Modal
        open={Boolean(exportWarning)}
        onClose={() => setExportWarning(null)}
        title="欠損ファイルがあります"
        subtitle="資料メタ情報は残っていますが、実ファイルが見つからない項目があります。"
      >
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5" />
            <div>
              <p className="font-semibold">このまま続けると、欠損している資料は ZIP に含まれません。</p>
              <ul className="mt-3 list-disc space-y-1 pl-5">
                {exportWarning?.missingFiles?.map((item) => (
                  <li key={item.id}>{item.displayName}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-6">
          <IconButton tone="light" onClick={() => setExportWarning(null)}>
            中止
          </IconButton>
          <IconButton onClick={() => handleExport(true)}>
            メタ情報だけで続行
          </IconButton>
        </div>
      </Modal>

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

export default App;
