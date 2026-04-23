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
  activeSlotKeyFor,
  buildNotePreview,
  dayLabelForKey,
  buildSubjectSearchHaystack,
  emptyNoteDraft,
  emptySubjectDraft,
  formatSlotLabel,
  isValidSubjectColor,
  nowIso,
  normalizeDateOnlyInputValue,
  normalizeNoteTitle,
  normalizeSubjectColorInput,
  parseOptionalDateInput,
  parseRequiredDateInput,
  slotKey,
  sortByUpdated,
  sortSlots,
  sortTodos,
  uid,
  weekdayKeyForToday,
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
const EMPTY_SUBJECT_HEADER_REQUESTS = {};
const EMPTY_SUBJECT_TAB_REQUESTS = {};
const SUBJECT_TAB_LOADERS = {
  [DETAIL_TABS.notes]: loadSubjectNotes,
  [DETAIL_TABS.materials]: loadSubjectMaterials,
  [DETAIL_TABS.attendance]: loadSubjectAttendance,
  [DETAIL_TABS.todos]: loadSubjectTodos,
};
const SUBJECT_HYDRATION_LOADERS = {
  header: loadSubjectHeader,
  notes: loadSubjectNotes,
  materials: loadSubjectMaterials,
  attendance: loadSubjectAttendance,
  todos: loadSubjectTodos,
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

function upsertById(items, item, sortFn = null) {
  const next = [...items.filter((entry) => entry.id !== item.id), item];
  return sortFn ? sortFn(next) : next;
}

function removeById(items, itemId, sortFn = null) {
  const next = items.filter((entry) => entry.id !== itemId);
  return sortFn ? sortFn(next) : next;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function clampCount(value) {
  return Math.max(0, value || 0);
}

function sortTimetableSlotItems(items = []) {
  const itemMap = new Map(items.map((item) => [item.slot.id, item]));
  return sortSlots(items.map((item) => item.slot)).map((slot) => itemMap.get(slot.id));
}

function firstSortableLibrarySlot(subject) {
  return sortSlots(subject?.slots || []).find((slot) => slot.activeSlotKey) || null;
}

function compareActiveLibrarySubjects(left, right) {
  const leftSlot = firstSortableLibrarySlot(left);
  const rightSlot = firstSortableLibrarySlot(right);
  if (leftSlot && !rightSlot) return -1;
  if (!leftSlot && rightSlot) return 1;
  if (leftSlot && rightSlot) {
    const sortedSlots = sortSlots([leftSlot, rightSlot]);
    if (sortedSlots[0].id !== sortedSlots[1].id) {
      return sortedSlots[0].id === leftSlot.id ? -1 : 1;
    }
  }
  return (left?.name || "").localeCompare(right?.name || "", "ja");
}

function compareArchivedLibrarySubjects(left, right) {
  return (left?.name || "").localeCompare(right?.name || "", "ja");
}

function buildOptimisticSubjectSlots(subjectId, termKey, selectedSlotKeys = [], timestamp = nowIso()) {
  return sortSlots(
    selectedSlotKeys.map((selectedSlotKey) => {
      const [weekday, periodNoRaw] = selectedSlotKey.split("-");
      const periodNo = Number(periodNoRaw);
      return {
        id: `optimistic-slot:${subjectId}:${weekday}:${periodNo}`,
        termKey,
        subjectId,
        weekday,
        periodNo,
        roomOverride: "",
        isArchived: false,
        activeSlotKey: activeSlotKeyFor(termKey, weekday, periodNo),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    }),
  );
}

function slotLabelFromSnapshot(snapshot) {
  if (!snapshot) return "";
  const baseLabel = formatSlotLabel(
    { weekday: snapshot.weekday, periodNo: snapshot.periodNo },
    [{
      periodNo: snapshot.periodNo,
      label: snapshot.label || `${snapshot.periodNo}限`,
      startTime: snapshot.startTime || "",
      endTime: snapshot.endTime || "",
    }],
  );
  return snapshot.isHistorical ? `${baseLabel} (履歴)` : baseLabel;
}

function sortAttendanceRecords(records = []) {
  return [...records].sort((left, right) => {
    if (left.lectureDate !== right.lectureDate) {
      return left.lectureDate < right.lectureDate ? 1 : -1;
    }

    const leftPeriod = left.slotSnapshot?.periodNo ?? Number.MAX_SAFE_INTEGER;
    const rightPeriod = right.slotSnapshot?.periodNo ?? Number.MAX_SAFE_INTEGER;
    if (leftPeriod !== rightPeriod) {
      return leftPeriod - rightPeriod;
    }

    return new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0);
  });
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
  const dashboardSummaryRef = useRef(EMPTY_STATS);
  const timetableDataRef = useRef(EMPTY_TIMETABLE);
  const libraryDataRef = useRef(EMPTY_LIBRARY);
  const todoPageDataRef = useRef(EMPTY_TODOS_PAGE);
  const subjectHeaderCacheRef = useRef({});
  const subjectTabCacheRef = useRef(EMPTY_TAB_CACHE);
  const dashboardRequestRef = useRef(0);
  const timetableRequestRef = useRef(0);
  const libraryRequestRef = useRef(0);
  const todoPageRequestRef = useRef(0);
  const subjectHeaderRequestRef = useRef(EMPTY_SUBJECT_HEADER_REQUESTS);
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
    dashboardSummaryRef.current = dashboardSummary;
  }, [dashboardSummary]);

  useEffect(() => {
    timetableDataRef.current = timetableData;
  }, [timetableData]);

  useEffect(() => {
    libraryDataRef.current = libraryData;
  }, [libraryData]);

  useEffect(() => {
    todoPageDataRef.current = todoPageData;
  }, [todoPageData]);

  useEffect(() => {
    subjectHeaderCacheRef.current = subjectHeaderCache;
  }, [subjectHeaderCache]);

  useEffect(() => {
    subjectTabCacheRef.current = subjectTabCache;
  }, [subjectTabCache]);

  const allSubjectsMap = useMemo(() => {
    const map = new Map();
    Object.values(subjectHeaderCache).forEach((header) => {
      if (header?.subject) map.set(header.subject.id, header.subject);
    });
    [...todoPageData.openTodos, ...todoPageData.doneTodos].forEach((todo) => {
      if (todo.subject) map.set(todo.subject.id, todo.subject);
    });
    const activeSubjects = Array.isArray(libraryData.activeSubjects) ? libraryData.activeSubjects : [];
    const archivedSubjects = Array.isArray(libraryData.archivedSubjects) ? libraryData.archivedSubjects : [];
    for (const subject of [...activeSubjects, ...archivedSubjects]) {
      map.set(subject.id, subject);
    }
    for (const item of timetableData.slots) {
      if (item.subject) {
        map.set(item.subject.id, item.subject);
      }
    }
    dashboardSummary.todayClasses.forEach((item) => {
      if (item.subject) map.set(item.subject.id, item.subject);
    });
    dashboardSummary.recentNotes.forEach((note) => {
      if (note.subject) map.set(note.subject.id, note.subject);
    });
    return map;
  }, [dashboardSummary, libraryData, subjectHeaderCache, timetableData, todoPageData]);

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
    const activeSubjects = Array.isArray(libraryData.activeSubjects) ? libraryData.activeSubjects : [];
    if (!q) return activeSubjects;
    return activeSubjects.filter((subject) => buildSubjectSearchHaystack(subject).includes(q));
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

  const runDeferredRefresh = useCallback(
    (task, { title, description = "画面を開き直すと最新状態を再取得できます。" }) => {
      void withBusy(async () => {
        try {
          await task();
        } catch (error) {
          pushToast({
            tone: "warning",
            title,
            description: `${description}${error?.message ? ` (${error.message})` : ""}`,
          });
        }
      });
    },
    [pushToast, withBusy],
  );

  const retryBootstrap = useCallback(() => {
    currentTermKeyRef.current = "";
    selectedSubjectIdRef.current = null;
    detailTabRef.current = DETAIL_TABS.notes;
    dashboardRequestRef.current += 1;
    timetableRequestRef.current += 1;
    libraryRequestRef.current += 1;
    todoPageRequestRef.current += 1;
    subjectHeaderRequestRef.current = {};
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
      const nextSummary = summary && Array.isArray(summary.todayClasses) && Array.isArray(summary.recentNotes)
        ? summary
        : EMPTY_STATS;
      setDashboardSummary(nextSummary);
      return nextSummary;
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
      const nextData = data && Array.isArray(data.periods) && Array.isArray(data.slots) ? data : EMPTY_TIMETABLE;
      setTimetableData(nextData);
      return nextData;
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
      const nextData = data && Array.isArray(data.periods) && Array.isArray(data.activeSubjects) && Array.isArray(data.archivedSubjects)
        ? data
        : EMPTY_LIBRARY;
      setLibraryData(nextData);
      return nextData;
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
      const nextData = data && Array.isArray(data.openTodos) && Array.isArray(data.doneTodos) ? data : EMPTY_TODOS_PAGE;
      setTodoPageData(nextData);
      return nextData;
    },
    [],
  );

  const refreshSubjectHeader = useCallback(async (subjectId) => {
    if (!subjectId) return null;
    const requestId = (subjectHeaderRequestRef.current[subjectId] || 0) + 1;
    subjectHeaderRequestRef.current = {
      ...subjectHeaderRequestRef.current,
      [subjectId]: requestId,
    };
    const shouldShowLoading = selectedSubjectIdRef.current === subjectId;
    if (shouldShowLoading) {
      setSubjectHeaderLoading(createSubjectLoadingDescriptor(subjectId, requestId, true));
    }
    try {
      const header = await loadSubjectHeader(subjectId);
      if (subjectHeaderRequestRef.current[subjectId] !== requestId) return header;
      if (!header) {
        setSubjectHeaderCache((current) => {
          if (!current[subjectId]) return current;
          const next = { ...current };
          delete next[subjectId];
          return next;
        });
        return null;
      }
      setSubjectHeaderCache((current) => ({ ...current, [subjectId]: header }));
      return header;
    } finally {
      if (shouldShowLoading && subjectHeaderRequestRef.current[subjectId] === requestId) {
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

  const handleStaleRecovery = useCallback(
    async (staleError, {
      message,
      fallbackTitle,
      resync,
      resyncFailureTitle = "競合後の表示更新に失敗しました。",
    }) => {
      let resyncError = null;
      try {
        await resync?.();
      } catch (error) {
        resyncError = error;
      }

      handleKnownError(createAppError(staleError.code, message), fallbackTitle);

      if (resyncError) {
        pushToast({
          tone: "warning",
          title: resyncFailureTitle,
          description: `最新状態の再取得に失敗しました。${errorMessage(resyncError)}`,
        });
      }
    },
    [handleKnownError, pushToast],
  );

  const loadSubjectHydrationBestEffort = useCallback(async (subjectId, options = {}) => {
    if (!subjectId) return {};
    const entries = Object.entries(options).filter(([, enabled]) => enabled);
    if (entries.length === 0) return {};

    const results = await Promise.allSettled(
      entries.map(([key]) => SUBJECT_HYDRATION_LOADERS[key](subjectId)),
    );

    return entries.reduce((hydration, [key], index) => {
      const result = results[index];
      hydration[key] = result.status === "fulfilled" ? result.value : null;
      return hydration;
    }, {});
  }, []);

  const resolveSubjectScopedSnapshot = useCallback((subjectId, explicit = {}) => {
    const cachedHeader = subjectHeaderCacheRef.current[subjectId] || null;
    const header = explicit.header ?? cachedHeader;
    const activeLibrarySubject = libraryDataRef.current.activeSubjects.find((entry) => entry.id === subjectId) || null;
    const archivedLibrarySubject = libraryDataRef.current.archivedSubjects.find((entry) => entry.id === subjectId) || null;
    const librarySubject = activeLibrarySubject || archivedLibrarySubject || null;
    const timetableItems = timetableDataRef.current.slots.filter((item) => item.subject?.id === subjectId);
    const timetableSubject = timetableItems[0]?.subject || null;
    const dashboardSubject = dashboardSummaryRef.current.todayClasses.find((item) => item.subject?.id === subjectId)?.subject
      || dashboardSummaryRef.current.recentNotes.find((note) => note.subject?.id === subjectId)?.subject
      || null;
    const openTodosFromPage = todoPageDataRef.current.openTodos.filter((todo) => todo.subjectId === subjectId);
    const doneTodosFromPage = todoPageDataRef.current.doneTodos.filter((todo) => todo.subjectId === subjectId);
    const fallbackTodosFromPage = openTodosFromPage.length || doneTodosFromPage.length
      ? [...openTodosFromPage, ...doneTodosFromPage]
      : undefined;
    const notes = Array.isArray(explicit.notes) ? explicit.notes : subjectTabCacheRef.current.notes[subjectId];
    const materials = Array.isArray(explicit.materials) ? explicit.materials : subjectTabCacheRef.current.materials[subjectId];
    const attendance = Array.isArray(explicit.attendance) ? explicit.attendance : subjectTabCacheRef.current.attendance[subjectId];
    const todos = Array.isArray(explicit.todos)
      ? explicit.todos
      : subjectTabCacheRef.current.todos[subjectId]?.length
        ? subjectTabCacheRef.current.todos[subjectId]
        : fallbackTodosFromPage;
    const slots = sortSlots(
      Array.isArray(explicit.slots)
        ? explicit.slots
        : Array.isArray(header?.slots) && header.slots.length
          ? header.slots
          : Array.isArray(librarySubject?.slots) && librarySubject.slots.length
            ? librarySubject.slots
            : timetableItems.map((item) => item.slot),
    );
    const subject = explicit.subject
      || header?.subject
      || librarySubject
      || timetableSubject
      || dashboardSubject
      || openTodosFromPage[0]?.subject
      || doneTodosFromPage[0]?.subject
      || null;

    return {
      subject,
      periods: explicit.periods ?? header?.periods ?? currentPeriods,
      slots,
      notes,
      materials,
      attendance,
      todos,
      notesCount: firstDefined(explicit.notesCount, header?.notesCount, Array.isArray(notes) ? notes.length : undefined),
      materialsCount: firstDefined(explicit.materialsCount, header?.materialsCount, Array.isArray(materials) ? materials.length : undefined),
      attendanceCount: firstDefined(explicit.attendanceCount, header?.attendanceCount, Array.isArray(attendance) ? attendance.length : undefined),
      openTodosCount: firstDefined(
        explicit.openTodosCount,
        header?.openTodosCount,
        Array.isArray(todos) ? todos.filter((todo) => todo.status === "open").length : undefined,
        openTodosFromPage.length ? openTodosFromPage.length : undefined,
        timetableItems[0]?.openTodoCount,
      ),
      doneTodosCount: firstDefined(
        explicit.doneTodosCount,
        header?.doneTodosCount,
        Array.isArray(todos) ? todos.filter((todo) => todo.status === "done").length : undefined,
        doneTodosFromPage.length ? doneTodosFromPage.length : undefined,
      ),
    };
  }, [currentPeriods]);

  const patchSavedSubjectCaches = useCallback((savedSubject, subjectDraft, overwriteConflictImpacts = [], { header = null } = {}) => {
    const optimisticSlots = buildOptimisticSubjectSlots(savedSubject.id, savedSubject.termKey, subjectDraft.selectedSlotKeys, savedSubject.updatedAt || nowIso());
    const optimisticActiveSlotKeys = new Set(optimisticSlots.map((slot) => slot.activeSlotKey).filter(Boolean));
    const librarySubject = { ...savedSubject, slots: optimisticSlots };
    const subjectSnapshot = resolveSubjectScopedSnapshot(savedSubject.id, { header });
    const preservedOpenTodoCount = firstDefined(subjectSnapshot.openTodosCount, 0);
    const knownCounts = {
      notesCount: subjectSnapshot.notesCount,
      materialsCount: subjectSnapshot.materialsCount,
      attendanceCount: subjectSnapshot.attendanceCount,
      openTodosCount: subjectSnapshot.openTodosCount,
      doneTodosCount: subjectSnapshot.doneTodosCount,
    };

    setLibraryData((current) => {
      const nextActiveSubjects = current.activeSubjects
        .filter((subject) => subject.id !== savedSubject.id)
        .map((subject) => {
          if (subject.id === savedSubject.id) return subject;
          if (!subject.slots?.length) return subject;
          return {
            ...subject,
            slots: subject.slots.filter((slot) => !optimisticActiveSlotKeys.has(slot.activeSlotKey)),
          };
        });
      return {
        ...current,
        activeSubjects: [...nextActiveSubjects, librarySubject].sort(compareActiveLibrarySubjects),
        archivedSubjects: current.archivedSubjects.filter((subject) => subject.id !== savedSubject.id),
      };
    });

    setTimetableData((current) => {
      const filteredSlotItems = current.slots.filter((item) => (
        item.subject?.id !== savedSubject.id
        && !optimisticActiveSlotKeys.has(item.slot.activeSlotKey)
      ));
      const optimisticSlotItems = optimisticSlots.map((slot) => ({
        slot,
        subject: savedSubject,
        openTodoCount: preservedOpenTodoCount,
      }));
      return {
        ...current,
        slots: sortTimetableSlotItems([...filteredSlotItems, ...optimisticSlotItems]),
      };
    });

    setSubjectHeaderCache((current) => {
      const next = { ...current };
      const existing = current[savedSubject.id];
      const nextHeader = {
        ...(existing || {}),
        subject: { ...(existing?.subject || subjectSnapshot.subject || {}), ...savedSubject },
        periods: header?.periods || existing?.periods || subjectSnapshot.periods || currentPeriods,
        slots: optimisticSlots,
      };
      Object.entries(knownCounts).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          nextHeader[key] = value;
        }
      });
      next[savedSubject.id] = nextHeader;

      Object.entries(current).forEach(([subjectId, header]) => {
        if (subjectId === savedSubject.id || !header?.slots?.length) return;
        const filteredSlots = header.slots.filter((slot) => !optimisticActiveSlotKeys.has(slot.activeSlotKey));
        if (filteredSlots.length !== header.slots.length) {
          next[subjectId] = {
            ...header,
            slots: filteredSlots,
          };
        }
      });

      return next;
    });

    setDashboardSummary((current) => ({
      ...current,
      activeSubjectsCount: subjectDraft.id ? current.activeSubjectsCount : current.activeSubjectsCount + 1,
      todayClasses: current.todayClasses.map((item) => (
        item.subject?.id === savedSubject.id
          ? { ...item, subject: { ...item.subject, ...savedSubject } }
          : item
      )),
      recentNotes: current.recentNotes.map((note) => (
        note.subject?.id === savedSubject.id
          ? { ...note, subject: { ...note.subject, ...savedSubject } }
          : note
      )),
    }));

    setTodoPageData((current) => ({
      openTodos: current.openTodos.map((todo) => (
        todo.subject?.id === savedSubject.id
          ? { ...todo, subject: { ...todo.subject, ...savedSubject } }
          : todo
      )),
      doneTodos: current.doneTodos.map((todo) => (
        todo.subject?.id === savedSubject.id
          ? { ...todo, subject: { ...todo.subject, ...savedSubject } }
          : todo
      )),
    }));

    if (overwriteConflictImpacts.length > 0) {
      setDashboardSummary((current) => ({
        ...current,
        todayClasses: current.todayClasses.filter((item) => !optimisticActiveSlotKeys.has(item.slot.activeSlotKey)),
      }));
    }
  }, [currentPeriods, resolveSubjectScopedSnapshot]);

  const patchArchivedSubjectCaches = useCallback((subject, {
    header = null,
    notes = null,
    materials = null,
    attendance = null,
    todos = null,
  } = {}) => {
    const archivedSnapshot = resolveSubjectScopedSnapshot(subject.id, {
      subject,
      header,
      notes,
      materials,
      attendance,
      todos,
    });
    const archivedSlots = sortSlots(archivedSnapshot.slots || []);
    const notesCount = firstDefined(archivedSnapshot.notesCount, 0);
    const materialsCount = firstDefined(archivedSnapshot.materialsCount, 0);
    const attendanceCount = firstDefined(archivedSnapshot.attendanceCount, 0);
    const removedOpenTodoCount = firstDefined(archivedSnapshot.openTodosCount, 0);
    const wasActive = libraryDataRef.current.activeSubjects.some((entry) => entry.id === subject.id);

    if (selectedSubjectIdRef.current === subject.id) {
      selectedSubjectIdRef.current = null;
      setSelectedSubjectId(null);
    }

    setLibraryData((current) => {
      const archivedSource = current.activeSubjects.find((entry) => entry.id === subject.id)
        || current.archivedSubjects.find((entry) => entry.id === subject.id);
      const nextArchivedSubject = {
        ...(archivedSource || archivedSnapshot.subject || {}),
        ...subject,
        isArchived: true,
        slots: archivedSlots,
      };
      return {
        ...current,
        activeSubjects: current.activeSubjects.filter((entry) => entry.id !== subject.id),
        archivedSubjects: [...current.archivedSubjects.filter((entry) => entry.id !== subject.id), nextArchivedSubject]
          .sort(compareArchivedLibrarySubjects),
      };
    });

    setTimetableData((current) => ({
      ...current,
      slots: current.slots.filter((item) => item.subject?.id !== subject.id),
    }));

    setSubjectHeaderCache((current) => {
      const baseHeader = current[subject.id] || header;
      if (!baseHeader && !archivedSnapshot.subject) return current;
      const nextHeader = {
        ...(baseHeader || {}),
        subject: { ...(baseHeader?.subject || archivedSnapshot.subject || {}), ...subject, isArchived: true },
        periods: header?.periods || baseHeader?.periods || archivedSnapshot.periods || currentPeriods,
        slots: archivedSlots,
      };
      if (archivedSnapshot.notesCount !== undefined && archivedSnapshot.notesCount !== null) {
        nextHeader.notesCount = archivedSnapshot.notesCount;
      }
      if (archivedSnapshot.materialsCount !== undefined && archivedSnapshot.materialsCount !== null) {
        nextHeader.materialsCount = archivedSnapshot.materialsCount;
      }
      if (archivedSnapshot.attendanceCount !== undefined && archivedSnapshot.attendanceCount !== null) {
        nextHeader.attendanceCount = archivedSnapshot.attendanceCount;
      }
      if (archivedSnapshot.openTodosCount !== undefined && archivedSnapshot.openTodosCount !== null) {
        nextHeader.openTodosCount = archivedSnapshot.openTodosCount;
      }
      if (archivedSnapshot.doneTodosCount !== undefined && archivedSnapshot.doneTodosCount !== null) {
        nextHeader.doneTodosCount = archivedSnapshot.doneTodosCount;
      }
      return {
        ...current,
        [subject.id]: nextHeader,
      };
    });

    if (Array.isArray(notes) || Array.isArray(materials) || Array.isArray(attendance) || Array.isArray(todos)) {
      setSubjectTabCache((current) => ({
        ...current,
        notes: Array.isArray(notes) ? { ...current.notes, [subject.id]: notes } : current.notes,
        materials: Array.isArray(materials) ? { ...current.materials, [subject.id]: materials } : current.materials,
        attendance: Array.isArray(attendance) ? { ...current.attendance, [subject.id]: attendance } : current.attendance,
        todos: Array.isArray(todos) ? { ...current.todos, [subject.id]: todos } : current.todos,
      }));
    }

    setTodoPageData((current) => ({
      openTodos: current.openTodos.filter((todo) => todo.subjectId !== subject.id),
      doneTodos: current.doneTodos.filter((todo) => todo.subjectId !== subject.id),
    }));

    setDashboardSummary((current) => ({
      ...current,
      activeSubjectsCount: wasActive ? clampCount(current.activeSubjectsCount - 1) : current.activeSubjectsCount,
      notesCount: wasActive ? clampCount(current.notesCount - notesCount) : current.notesCount,
      materialsCount: wasActive ? clampCount(current.materialsCount - materialsCount) : current.materialsCount,
      attendanceCount: wasActive ? clampCount(current.attendanceCount - attendanceCount) : current.attendanceCount,
      openTodosCount: wasActive ? clampCount(current.openTodosCount - removedOpenTodoCount) : current.openTodosCount,
      todayClasses: current.todayClasses.filter((item) => item.subject?.id !== subject.id),
      recentNotes: current.recentNotes.filter((note) => note.subjectId !== subject.id),
    }));
  }, [currentPeriods, resolveSubjectScopedSnapshot]);

  const patchRestoredSubjectCaches = useCallback((subject, {
    header = null,
    notes = null,
    materials = null,
    attendance = null,
    todos = null,
    restoredSlots = [],
  } = {}) => {
    const restoredSnapshot = resolveSubjectScopedSnapshot(subject.id, {
      subject,
      header,
      notes,
      materials,
      attendance,
      todos,
      slots: header?.slots?.length
        ? header.slots
        : restoredSlots.length
          ? restoredSlots
          : undefined,
    });
    const hydratedSlots = sortSlots(
      restoredSnapshot.slots?.length
        ? restoredSnapshot.slots
        : restoredSlots,
    );
    const restoredSubject = {
      ...(restoredSnapshot.subject || {}),
      ...subject,
      isArchived: false,
      slots: hydratedSlots,
    };
    const counts = {
      notesCount: firstDefined(restoredSnapshot.notesCount, 0),
      materialsCount: firstDefined(restoredSnapshot.materialsCount, 0),
      attendanceCount: firstDefined(restoredSnapshot.attendanceCount, 0),
      openTodosCount: firstDefined(restoredSnapshot.openTodosCount, 0),
      doneTodosCount: firstDefined(restoredSnapshot.doneTodosCount, 0),
    };
    const nextHeader = {
      ...(subjectHeaderCacheRef.current[subject.id] || {}),
      subject: { ...(subjectHeaderCacheRef.current[subject.id]?.subject || restoredSnapshot.subject || {}), ...subject, isArchived: false },
      periods: restoredSnapshot.periods || currentPeriods,
      slots: hydratedSlots,
      ...counts,
    };
    const restoredNotes = Array.isArray(restoredSnapshot.notes) ? restoredSnapshot.notes : [];
    const restoredTodos = Array.isArray(restoredSnapshot.todos) ? restoredSnapshot.todos : [];
    const hydratedOpenTodos = restoredTodos
      .filter((todo) => todo.status === "open")
      .map((todo) => ({ ...todo, subject: restoredSubject }));
    const hydratedDoneTodos = restoredTodos
      .filter((todo) => todo.status === "done")
      .map((todo) => ({ ...todo, subject: restoredSubject }));
    const hydratedRecentNotes = restoredNotes.map((note) => ({
      ...note,
      previewText: buildNotePreview(note.bodyText),
      subject: restoredSubject,
    }));
    const wasActive = libraryDataRef.current.activeSubjects.some((entry) => entry.id === subject.id);
    const todayKey = weekdayKeyForToday();
    const restoredTodayClasses = hydratedSlots
      .filter((slot) => slot.activeSlotKey && slot.weekday === todayKey)
      .map((slot) => ({
        slot,
        subject: restoredSubject,
        period: (restoredSnapshot.periods || currentPeriods).find((period) => period.periodNo === slot.periodNo) || null,
      }));

    setLibraryData((current) => {
      return {
        ...current,
        activeSubjects: [...current.activeSubjects.filter((entry) => entry.id !== subject.id), restoredSubject]
          .sort(compareActiveLibrarySubjects),
        archivedSubjects: current.archivedSubjects.filter((entry) => entry.id !== subject.id),
      };
    });

    setTimetableData((current) => {
      const nextSlotItems = hydratedSlots.map((slot) => ({
        slot,
        subject: restoredSubject,
        openTodoCount: counts.openTodosCount,
      }));
      return {
        ...current,
        slots: sortTimetableSlotItems([
          ...current.slots.filter((item) => item.subject?.id !== subject.id),
          ...nextSlotItems,
        ]),
      };
    });

    setSubjectHeaderCache((current) => ({
      ...current,
      [subject.id]: nextHeader,
    }));

    if (
      Array.isArray(notes)
      || Array.isArray(materials)
      || Array.isArray(attendance)
      || Array.isArray(todos)
    ) {
      setSubjectTabCache((current) => ({
        ...current,
        notes: Array.isArray(notes) ? { ...current.notes, [subject.id]: notes } : current.notes,
        materials: Array.isArray(materials) ? { ...current.materials, [subject.id]: materials } : current.materials,
        attendance: Array.isArray(attendance) ? { ...current.attendance, [subject.id]: attendance } : current.attendance,
        todos: Array.isArray(todos) ? { ...current.todos, [subject.id]: todos } : current.todos,
      }));
    }

    setTodoPageData((current) => ({
      openTodos: sortTodos([
        ...current.openTodos.filter((todo) => todo.subjectId !== subject.id),
        ...hydratedOpenTodos,
      ]),
      doneTodos: sortTodos([
        ...current.doneTodos.filter((todo) => todo.subjectId !== subject.id),
        ...hydratedDoneTodos,
      ]),
    }));

    setDashboardSummary((current) => ({
      ...current,
      activeSubjectsCount: wasActive ? current.activeSubjectsCount : current.activeSubjectsCount + 1,
      notesCount: wasActive ? current.notesCount : current.notesCount + counts.notesCount,
      materialsCount: wasActive ? current.materialsCount : current.materialsCount + counts.materialsCount,
      attendanceCount: wasActive ? current.attendanceCount : current.attendanceCount + counts.attendanceCount,
      openTodosCount: wasActive ? current.openTodosCount : current.openTodosCount + counts.openTodosCount,
      todayClasses: sortTimetableSlotItems([
        ...current.todayClasses.filter((item) => item.subject?.id !== subject.id),
        ...restoredTodayClasses,
      ]),
      recentNotes: sortByUpdated([
        ...current.recentNotes.filter((note) => note.subjectId !== subject.id),
        ...hydratedRecentNotes,
      ]).slice(0, 6),
    }));
  }, [currentPeriods, resolveSubjectScopedSnapshot]);

  const patchSavedNoteCaches = useCallback((savedNote, { isNew = false } = {}) => {
    const subject = allSubjectsMap.get(savedNote.subjectId) || selectedHeader?.subject || null;
    const hydratedNote = {
      ...savedNote,
      previewText: buildNotePreview(savedNote.bodyText),
      subject,
    };

    setSubjectTabCache((current) => ({
      ...current,
      notes: {
        ...current.notes,
        [savedNote.subjectId]: upsertById(current.notes[savedNote.subjectId] || [], savedNote, sortByUpdated),
      },
    }));

    setSubjectHeaderCache((current) => {
      const header = current[savedNote.subjectId];
      if (!header) return current;
      return {
        ...current,
        [savedNote.subjectId]: {
          ...header,
          notesCount: header.notesCount + (isNew ? 1 : 0),
        },
      };
    });

    setDashboardSummary((current) => ({
      ...current,
      notesCount: current.notesCount + (isNew ? 1 : 0),
      recentNotes: upsertById(current.recentNotes, hydratedNote, sortByUpdated).slice(0, 6),
    }));
  }, [allSubjectsMap, selectedHeader?.subject]);

  const removeNoteFromCaches = useCallback((note) => {
    setSubjectTabCache((current) => ({
      ...current,
      notes: {
        ...current.notes,
        [note.subjectId]: removeById(current.notes[note.subjectId] || [], note.id, sortByUpdated),
      },
    }));

    setSubjectHeaderCache((current) => {
      const header = current[note.subjectId];
      if (!header) return current;
      return {
        ...current,
        [note.subjectId]: {
          ...header,
          notesCount: clampCount(header.notesCount - 1),
        },
      };
    });

    setDashboardSummary((current) => ({
      ...current,
      notesCount: clampCount(current.notesCount - 1),
      recentNotes: removeById(current.recentNotes, note.id, sortByUpdated),
    }));
  }, []);

  const dropNoteFromVisibleCaches = useCallback((note) => {
    setSubjectTabCache((current) => ({
      ...current,
      notes: {
        ...current.notes,
        [note.subjectId]: removeById(current.notes[note.subjectId] || [], note.id, sortByUpdated),
      },
    }));
    setDashboardSummary((current) => ({
      ...current,
      recentNotes: removeById(current.recentNotes, note.id, sortByUpdated),
    }));
  }, []);

  const patchSavedTodoCaches = useCallback((savedTodo, { previousStatus = null } = {}) => {
    const subject = allSubjectsMap.get(savedTodo.subjectId) || selectedHeader?.subject || null;
    const hydratedTodo = { ...savedTodo, subject };
    const cachedTodo = (subjectTabCacheRef.current.todos[savedTodo.subjectId] || []).find((todo) => todo.id === savedTodo.id)
      || todoPageDataRef.current.openTodos.find((todo) => todo.id === savedTodo.id)
      || todoPageDataRef.current.doneTodos.find((todo) => todo.id === savedTodo.id)
      || null;
    const resolvedPreviousStatus = previousStatus ?? cachedTodo?.status ?? null;
    const openDelta = Number(savedTodo.status === "open") - Number(resolvedPreviousStatus === "open");
    const doneDelta = Number(savedTodo.status === "done") - Number(resolvedPreviousStatus === "done");

    setSubjectTabCache((current) => ({
      ...current,
      todos: {
        ...current.todos,
        [savedTodo.subjectId]: upsertById(current.todos[savedTodo.subjectId] || [], hydratedTodo, sortTodos),
      },
    }));

    setTodoPageData((current) => ({
      openTodos: savedTodo.status === "open"
        ? sortTodos([...current.openTodos.filter((todo) => todo.id !== savedTodo.id), hydratedTodo])
        : current.openTodos.filter((todo) => todo.id !== savedTodo.id),
      doneTodos: savedTodo.status === "done"
        ? sortTodos([...current.doneTodos.filter((todo) => todo.id !== savedTodo.id), hydratedTodo])
        : current.doneTodos.filter((todo) => todo.id !== savedTodo.id),
    }));

    setSubjectHeaderCache((current) => {
      const header = current[savedTodo.subjectId];
      if (!header) return current;
      return {
        ...current,
        [savedTodo.subjectId]: {
          ...header,
          openTodosCount: clampCount(header.openTodosCount + openDelta),
          doneTodosCount: clampCount(header.doneTodosCount + doneDelta),
        },
      };
    });

    setDashboardSummary((current) => ({
      ...current,
      openTodosCount: clampCount(current.openTodosCount + openDelta),
    }));

    setTimetableData((current) => ({
      ...current,
      slots: current.slots.map((item) => (
        item.subject?.id === savedTodo.subjectId
          ? { ...item, openTodoCount: clampCount((item.openTodoCount || 0) + openDelta) }
          : item
      )),
    }));
  }, [allSubjectsMap, selectedHeader?.subject]);

  const removeTodoFromCaches = useCallback((todo, { fallbackStatus = null } = {}) => {
    const cachedTodo = (subjectTabCacheRef.current.todos[todo.subjectId] || []).find((entry) => entry.id === todo.id)
      || todoPageDataRef.current.openTodos.find((entry) => entry.id === todo.id)
      || todoPageDataRef.current.doneTodos.find((entry) => entry.id === todo.id)
      || null;
    const resolvedStatus = cachedTodo?.status || fallbackStatus;
    const openDelta = resolvedStatus === "open" ? -1 : 0;
    const doneDelta = resolvedStatus === "done" ? -1 : 0;

    setSubjectTabCache((current) => ({
      ...current,
      todos: {
        ...current.todos,
        [todo.subjectId]: removeById(current.todos[todo.subjectId] || [], todo.id, sortTodos),
      },
    }));

    setTodoPageData((current) => ({
      openTodos: current.openTodos.filter((entry) => entry.id !== todo.id),
      doneTodos: current.doneTodos.filter((entry) => entry.id !== todo.id),
    }));

    setSubjectHeaderCache((current) => {
      const header = current[todo.subjectId];
      if (!header) return current;
      return {
        ...current,
        [todo.subjectId]: {
          ...header,
          openTodosCount: clampCount(header.openTodosCount + openDelta),
          doneTodosCount: clampCount(header.doneTodosCount + doneDelta),
        },
      };
    });

    setDashboardSummary((current) => ({
      ...current,
      openTodosCount: clampCount(current.openTodosCount + openDelta),
    }));

    setTimetableData((current) => ({
      ...current,
      slots: current.slots.map((item) => (
        item.subject?.id === todo.subjectId
          ? { ...item, openTodoCount: clampCount((item.openTodoCount || 0) + openDelta) }
          : item
      )),
    }));
  }, []);

  const dropTodoFromVisibleCaches = useCallback((todo) => {
    setSubjectTabCache((current) => ({
      ...current,
      todos: {
        ...current.todos,
        [todo.subjectId]: removeById(current.todos[todo.subjectId] || [], todo.id, sortTodos),
      },
    }));
    setTodoPageData((current) => ({
      openTodos: current.openTodos.filter((entry) => entry.id !== todo.id),
      doneTodos: current.doneTodos.filter((entry) => entry.id !== todo.id),
    }));
  }, []);

  const patchSavedMaterialCaches = useCallback((material, { isNew = false } = {}) => {
    setSubjectTabCache((current) => ({
      ...current,
      materials: {
        ...current.materials,
        [material.subjectId]: upsertById(current.materials[material.subjectId] || [], material, sortByUpdated),
      },
    }));

    if (isNew) {
      setSubjectHeaderCache((current) => {
        const header = current[material.subjectId];
        if (!header) return current;
        return {
          ...current,
          [material.subjectId]: {
            ...header,
            materialsCount: header.materialsCount + 1,
          },
        };
      });

      setDashboardSummary((current) => ({
        ...current,
        materialsCount: current.materialsCount + 1,
      }));
    }
  }, []);

  const removeMaterialFromCaches = useCallback((material) => {
    setSubjectTabCache((current) => ({
      ...current,
      materials: {
        ...current.materials,
        [material.subjectId]: removeById(current.materials[material.subjectId] || [], material.id, sortByUpdated),
      },
    }));

    setSubjectHeaderCache((current) => {
      const header = current[material.subjectId];
      if (!header) return current;
      return {
        ...current,
        [material.subjectId]: {
          ...header,
          materialsCount: clampCount(header.materialsCount - 1),
        },
      };
    });

    setDashboardSummary((current) => ({
      ...current,
      materialsCount: clampCount(current.materialsCount - 1),
    }));
  }, []);

  const dropMaterialFromVisibleCaches = useCallback((material) => {
    setSubjectTabCache((current) => ({
      ...current,
      materials: {
        ...current.materials,
        [material.subjectId]: removeById(current.materials[material.subjectId] || [], material.id, sortByUpdated),
      },
    }));
  }, []);

  const patchSavedAttendanceCaches = useCallback((attendanceRecord, { isNew = false } = {}) => {
    const hydratedRecord = {
      ...attendanceRecord,
      lectureDate: normalizeDateOnlyInputValue(attendanceRecord.lectureDate),
      timetableSlotId: attendanceRecord.timetableSlotId || "",
      slotLabel: slotLabelFromSnapshot(attendanceRecord.slotSnapshot),
    };

    setSubjectTabCache((current) => ({
      ...current,
      attendance: {
        ...current.attendance,
        [attendanceRecord.subjectId]: upsertById(
          current.attendance[attendanceRecord.subjectId] || [],
          hydratedRecord,
          sortAttendanceRecords,
        ),
      },
    }));

    if (isNew) {
      setSubjectHeaderCache((current) => {
        const header = current[attendanceRecord.subjectId];
        if (!header) return current;
        return {
          ...current,
          [attendanceRecord.subjectId]: {
            ...header,
            attendanceCount: header.attendanceCount + 1,
          },
        };
      });

      setDashboardSummary((current) => ({
        ...current,
        attendanceCount: current.attendanceCount + 1,
      }));
    }
  }, []);

  const removeAttendanceFromCaches = useCallback((attendanceRecord) => {
    setSubjectTabCache((current) => ({
      ...current,
      attendance: {
        ...current.attendance,
        [attendanceRecord.subjectId]: removeById(
          current.attendance[attendanceRecord.subjectId] || [],
          attendanceRecord.id,
          sortAttendanceRecords,
        ),
      },
    }));

    setSubjectHeaderCache((current) => {
      const header = current[attendanceRecord.subjectId];
      if (!header) return current;
      return {
        ...current,
        [attendanceRecord.subjectId]: {
          ...header,
          attendanceCount: clampCount(header.attendanceCount - 1),
        },
      };
    });

    setDashboardSummary((current) => ({
      ...current,
      attendanceCount: clampCount(current.attendanceCount - 1),
    }));
  }, []);

  const dropAttendanceFromVisibleCaches = useCallback((attendanceRecord) => {
    setSubjectTabCache((current) => ({
      ...current,
      attendance: {
        ...current.attendance,
        [attendanceRecord.subjectId]: removeById(
          current.attendance[attendanceRecord.subjectId] || [],
          attendanceRecord.id,
          sortAttendanceRecords,
        ),
      },
    }));
  }, []);

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
    const missingMaterialWarningCount = result?.warnings?.filter((warning) => warning.code === "MISSING_MATERIAL_FILE").length || 0;
    const cleanupWarning = result?.warnings?.find((warning) => warning.code === "MATERIAL_STORAGE_CLEANUP_FAILED");
    pushToast({
      tone: "success",
      title: "バックアップを復元しました。",
      description: missingMaterialWarningCount
        ? `資料ファイル ${missingMaterialWarningCount} 件は欠損のまま復元されました。`
        : undefined,
    });
    if (cleanupWarning) {
      pushToast({
        tone: "warning",
        title: "古い資料ファイルの整理に失敗しました。",
        description: cleanupWarning.message,
      });
    }
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

    const subjectDraft = { ...draft, termKey: draft.termKey || currentTermKey };
    const refreshSubjectCollections = () => Promise.all([
      refreshDashboard(currentTermKey),
      refreshTimetable(currentTermKey),
      refreshLibrary(currentTermKey),
      refreshTodosPage(currentTermKey),
    ]);
    const saveWithSharedHandling = async ({ overwriteConflicts }) => {
      try {
        return await withBusy(() => saveSubject(subjectDraft, { overwriteConflicts }));
      } catch (error) {
        if (!overwriteConflicts && error?.code === "SLOT_CONFLICT") {
          throw error;
        }
        if (error?.code === "INVALID_SLOT_SELECTION" || error?.code === "INVALID_SUBJECT" || error?.code === "INVALID_SUBJECT_COLOR" || error?.code === "ARCHIVE_VIA_ACTION_REQUIRED") {
          handleKnownError(error, "授業を保存できませんでした。");
          throw error;
        }
        if (error?.code === "STALE_DRAFT" || error?.code === "STALE_UPDATE") {
          await handleStaleRecovery(error, {
            message: "この授業は別の画面で更新または削除されています。授業一覧を開き直してから編集してください。",
            fallbackTitle: "授業を保存できませんでした。",
            resync: async () => {
              await refreshSubjectCollections();
              if (subjectDraft.id) {
                await refreshSelectedSubjectSlice(subjectDraft.id);
              }
            },
            resyncFailureTitle: "授業の再同期に失敗しました。",
          });
          throw error;
        }
        handleKnownError(error, "授業の保存に失敗しました。");
        throw error;
      }
    };

    let savedSubject;
    let overwriteConflictImpacts = [];
    try {
      savedSubject = await saveWithSharedHandling({ overwriteConflicts: false });
    } catch (error) {
      if (error?.code === "SLOT_CONFLICT") {
        const confirmed = window.confirm(`次のコマは既に使用中です。上書きしますか？\n${describeSlotConflicts(error.data?.conflicts)}`);
        if (!confirmed) {
          throw createAppError("CANCELLED", "");
        }
        overwriteConflictImpacts = error.data?.conflicts || [];
        savedSubject = await saveWithSharedHandling({ overwriteConflicts: true });
      }
      else {
        throw error;
      }
    }

    const savedSubjectHydration = await loadSubjectHydrationBestEffort(savedSubject.id, { header: true });
    selectedSubjectIdRef.current = savedSubject.id;
    setSelectedSubjectId(savedSubject.id);
    patchSavedSubjectCaches(savedSubject, subjectDraft, overwriteConflictImpacts, {
      header: savedSubjectHydration.header || null,
    });
    pushToast({ tone: "success", title: "授業を保存しました。" });
    runDeferredRefresh(
      () => Promise.all([
        refreshDashboard(currentTermKey),
        refreshTimetable(currentTermKey),
        refreshLibrary(currentTermKey),
        refreshTodosPage(currentTermKey),
        refreshSelectedSubjectSlice(savedSubject.id),
      ]),
      { title: "授業は保存済みですが、表示更新に失敗しました。" },
    );
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
      const archiveSnapshot = await loadSubjectHydrationBestEffort(subject.id, {
        header: true,
        notes: true,
        materials: true,
        attendance: true,
        todos: true,
      });
      const archivedSubject = await withBusy(() => archiveSubject(subject.id));
      patchArchivedSubjectCaches(archivedSubject || { ...subject, isArchived: true }, archiveSnapshot);
      pushToast({ tone: "success", title: "授業をアーカイブしました。" });
      runDeferredRefresh(
        () => Promise.all([
          refreshDashboard(currentTermKey),
          refreshTimetable(currentTermKey),
          refreshLibrary(currentTermKey),
          refreshTodosPage(currentTermKey),
        ]),
        { title: "授業はアーカイブ済みですが、表示更新に失敗しました。" },
      );
    } catch (error) {
      if (error?.code === "ALREADY_ARCHIVED_SUBJECT") {
        patchArchivedSubjectCaches(error.data?.subject || { ...subject, isArchived: true });
        pushToast({
          tone: "warning",
          title: "この授業は既にアーカイブされています。",
        });
        runDeferredRefresh(
          () => Promise.all([
            refreshDashboard(currentTermKey),
            refreshTimetable(currentTermKey),
            refreshLibrary(currentTermKey),
            refreshTodosPage(currentTermKey),
          ]),
          { title: "授業の再同期に失敗しました。" },
        );
        return;
      }
      handleKnownError(error, "アーカイブに失敗しました。");
    }
  }

  async function handleRestoreSubject(subject) {
    try {
      const result = await withBusy(() => restoreSubject(subject.id));
      const restoredSubject = result.subject || { ...subject, isArchived: false };
      const restoredContext = await loadSubjectHydrationBestEffort(restoredSubject.id, {
        header: true,
        notes: true,
        materials: true,
        attendance: true,
        todos: true,
      });
      patchRestoredSubjectCaches(restoredSubject, {
        header: restoredContext.header || null,
        notes: restoredContext.notes || null,
        materials: restoredContext.materials || null,
        attendance: restoredContext.attendance || null,
        todos: restoredContext.todos || null,
        restoredSlots: result.restoredSlots || [],
      });
      runDeferredRefresh(
        () => Promise.all([
          refreshDashboard(currentTermKey),
          refreshTimetable(currentTermKey),
          refreshLibrary(currentTermKey),
          refreshTodosPage(currentTermKey),
        ]),
        { title: "授業は復元済みですが、表示更新に失敗しました。" },
      );
      if (result.restoredSlotCount === 0) {
        pushToast({
          tone: "warning",
          title: "授業一覧へ戻しましたが、時間割コマは未設定です。",
          description: "コマを設定してから使い始めてください。",
        });
        openEditSubject({
          ...restoredSubject,
          slots: restoredContext.header?.slots || result.restoredSlots || [],
        });
        return;
      }
      pushToast({ tone: "success", title: "授業を復元しました。" });
    } catch (error) {
      if (error?.code === "ALREADY_ACTIVE_SUBJECT") {
        const restoredSubject = error.data?.subject || { ...subject, isArchived: false };
        const restoredContext = await loadSubjectHydrationBestEffort(restoredSubject.id, {
          header: true,
          notes: true,
          materials: true,
          attendance: true,
          todos: true,
        });
        patchRestoredSubjectCaches(restoredSubject, {
          header: restoredContext.header || null,
          notes: restoredContext.notes || null,
          materials: restoredContext.materials || null,
          attendance: restoredContext.attendance || null,
          todos: restoredContext.todos || null,
          restoredSlots: restoredContext.header?.slots || subject.slots || [],
        });
        pushToast({
          tone: "warning",
          title: "この授業は既に復元されています。",
        });
        runDeferredRefresh(
          () => Promise.all([
            refreshDashboard(currentTermKey),
            refreshTimetable(currentTermKey),
            refreshLibrary(currentTermKey),
            refreshTodosPage(currentTermKey),
          ]),
          { title: "授業の再同期に失敗しました。" },
        );
        return;
      }
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
    const lectureDateInput = parseRequiredDateInput(draft.lectureDate, { fieldLabel: "講義日" });
    if (!draft.title.trim() && !draft.bodyText.trim()) {
      const error = createAppError("INVALID_NOTE", "タイトルか本文のどちらかを入力してください。");
      handleKnownError(error, "ノートを保存できませんでした。");
      throw error;
    }
    if (!lectureDateInput.isValid) {
      const error = createAppError("INVALID_NOTE_DATE", lectureDateInput.error);
      handleKnownError(error, "ノートを保存できませんでした。");
      throw error;
    }
    const nextDraft = { ...draft, lectureDate: lectureDateInput.normalized };
    try {
      const savedNote = await withBusy(() => saveNote(nextDraft));
      patchSavedNoteCaches(savedNote, { isNew: !draft.id });
      pushToast({ tone: "success", title: "ノートを保存しました。" });
      runDeferredRefresh(
        () => Promise.all([
          refreshDashboard(currentTermKey),
          refreshSelectedSubjectSlice(nextDraft.subjectId, { notes: true }),
        ]),
        { title: "ノートは保存済みですが、表示更新に失敗しました。" },
      );
    } catch (error) {
      if (error?.code === "STALE_DRAFT" || error?.code === "STALE_UPDATE") {
        await handleStaleRecovery(error, {
          message: "このノートは別の画面で更新または削除されています。開き直してから編集してください。",
          fallbackTitle: "ノートを保存できませんでした。",
          resync: () => Promise.all([
            refreshDashboard(currentTermKey),
            refreshSelectedSubjectSlice(nextDraft.subjectId, { notes: true }),
          ]),
          resyncFailureTitle: "ノートの再同期に失敗しました。",
        });
        throw error;
      }
      handleKnownError(error, "ノートの保存に失敗しました。");
      throw error;
    }
  }

  async function handleDeleteNote(note) {
    const noteTitle = normalizeNoteTitle(note.title);
    if (!window.confirm(`「${noteTitle}」を削除しますか？`)) return;
    try {
      const deletedNote = await withBusy(() => deleteNote(note.id));
      removeNoteFromCaches(deletedNote);
      if (noteModalState.initialValue?.id === note.id) {
        closeNoteModal();
      }
      pushToast({ tone: "success", title: "ノートを削除しました。" });
      runDeferredRefresh(
        () => Promise.all([
          refreshDashboard(currentTermKey),
          refreshSelectedSubjectSlice(note.subjectId, { notes: true }),
        ]),
        { title: "ノートは削除済みですが、表示更新に失敗しました。" },
      );
    } catch (error) {
      if (error?.code === "STALE_DRAFT") {
        dropNoteFromVisibleCaches(note);
        closeNoteModal();
        runDeferredRefresh(
          () => Promise.all([
            refreshDashboard(currentTermKey),
            refreshSelectedSubjectSlice(note.subjectId, { notes: true }),
          ]),
          { title: "ノートの再同期に失敗しました。" },
        );
        handleKnownError(error, "ノートは既に削除されています。");
        return;
      }
      handleKnownError(error, "ノートの削除に失敗しました。");
    }
  }

  async function handleUploadMaterials(files) {
    if (!selectedSubjectId || files.length === 0) return;
    try {
      const savedMaterials = await withBusy(() => saveMaterialsBatch(selectedSubjectId, files, ""));
      savedMaterials.forEach((material) => patchSavedMaterialCaches(material, { isNew: true }));
      pushToast({ tone: "success", title: `${files.length} 件の資料を保存しました。` });
      runDeferredRefresh(
        () => Promise.all([
          refreshDashboard(currentTermKey),
          refreshSelectedSubjectSlice(selectedSubjectId, { materials: true }),
        ]),
        { title: "資料は保存済みですが、表示更新に失敗しました。" },
      );
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
      removeMaterialFromCaches(result.material || meta);
      if (materialModalState.material?.id === meta.id) {
        setMaterialModalState({ open: false, material: null });
      }
      pushToast({
        tone: result.cleanupWarning ? "warning" : "success",
        title: "資料を削除しました。",
        description: result.cleanupWarning
          ? result.cleanupError
            ? `実ファイルの削除に失敗しましたが、資料情報は削除しました。(${result.cleanupError})`
            : "実ファイルは既に見つかりませんでしたが、資料情報は削除しました。"
          : "",
      });
      runDeferredRefresh(
        () => Promise.all([
          refreshDashboard(currentTermKey),
          refreshSelectedSubjectSlice(meta.subjectId, { materials: true }),
        ]),
        { title: "資料は削除済みですが、表示更新に失敗しました。" },
      );
    } catch (error) {
      if (error?.code === "STALE_DRAFT") {
        dropMaterialFromVisibleCaches(meta);
        if (materialModalState.material?.id === meta.id) {
          setMaterialModalState({ open: false, material: null });
        }
        runDeferredRefresh(
          () => Promise.all([
            refreshDashboard(currentTermKey),
            refreshSelectedSubjectSlice(meta.subjectId, { materials: true }),
          ]),
          { title: "資料の再同期に失敗しました。" },
        );
        handleKnownError(error, "資料は既に削除されています。");
        return;
      }
      handleKnownError(error, "資料の削除に失敗しました。");
    }
  }

  async function handleSaveMaterialNote(draft) {
    const subjectId = selectedSubjectId;
    try {
      const savedMaterial = await withBusy(() => updateMaterialNote(draft.id, draft.note, draft.baseUpdatedAt));
      patchSavedMaterialCaches(savedMaterial);
      pushToast({ tone: "success", title: "資料メモを保存しました。" });
      if (subjectId) {
        runDeferredRefresh(
          () => refreshSelectedSubjectSlice(subjectId, { materials: true }),
          { title: "資料メモは保存済みですが、表示更新に失敗しました。" },
        );
      }
    } catch (error) {
      if (error?.code === "STALE_DRAFT" || error?.code === "STALE_UPDATE") {
        await handleStaleRecovery(error, {
          message: "この資料メモは別の画面で更新または削除されています。開き直してから編集してください。",
          fallbackTitle: "資料メモを保存できませんでした。",
          resync: () => (
            selectedSubjectId
              ? refreshSelectedSubjectSlice(selectedSubjectId, { materials: true })
              : Promise.resolve()
          ),
          resyncFailureTitle: "資料メモの再同期に失敗しました。",
        });
        throw error;
      }
      handleKnownError(error, "資料メモの保存に失敗しました。");
      throw error;
    }
  }

  async function handleSaveAttendance(draft) {
    const lectureDateInput = parseRequiredDateInput(draft.lectureDate, { fieldLabel: "講義日" });
    if (!lectureDateInput.isValid) {
      const error = createAppError("INVALID_ATTENDANCE_DATE", lectureDateInput.error);
      handleKnownError(error, "出席を保存できませんでした。");
      throw error;
    }
    const nextDraft = { ...draft, lectureDate: lectureDateInput.normalized };
    try {
      const savedAttendance = await withBusy(() => saveAttendance(nextDraft));
      const isNew = !(subjectTabCacheRef.current.attendance[nextDraft.subjectId] || []).some((record) => record.id === savedAttendance.id);
      patchSavedAttendanceCaches(savedAttendance, { isNew });
      pushToast({ tone: "success", title: "出席を保存しました。" });
      runDeferredRefresh(
        () => Promise.all([
          refreshDashboard(currentTermKey),
          refreshSelectedSubjectSlice(nextDraft.subjectId, { attendance: true }),
        ]),
        { title: "出席は保存済みですが、表示更新に失敗しました。" },
      );
    } catch (error) {
      if (error?.code === "STALE_DRAFT" || error?.code === "STALE_UPDATE") {
        await handleStaleRecovery(error, {
          message: "この出席記録は別の画面で更新または削除されています。開き直してから編集してください。",
          fallbackTitle: "出席を保存できませんでした。",
          resync: () => Promise.all([
            refreshDashboard(currentTermKey),
            refreshSelectedSubjectSlice(nextDraft.subjectId, { attendance: true }),
          ]),
          resyncFailureTitle: "出席記録の再同期に失敗しました。",
        });
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
      const deletedAttendance = await withBusy(() => deleteAttendance(record.id));
      removeAttendanceFromCaches(deletedAttendance);
      pushToast({ tone: "success", title: "出席記録を削除しました。" });
      runDeferredRefresh(
        () => Promise.all([
          refreshDashboard(currentTermKey),
          refreshSelectedSubjectSlice(record.subjectId, { attendance: true }),
        ]),
        { title: "出席記録は削除済みですが、表示更新に失敗しました。" },
      );
    } catch (error) {
      if (error?.code === "STALE_DRAFT") {
        dropAttendanceFromVisibleCaches(record);
        runDeferredRefresh(
          () => Promise.all([
            refreshDashboard(currentTermKey),
            refreshSelectedSubjectSlice(record.subjectId, { attendance: true }),
          ]),
          { title: "出席記録の再同期に失敗しました。" },
        );
        handleKnownError(error, "出席記録は既に削除されています。");
        return;
      }
      handleKnownError(error, "出席記録の削除に失敗しました。");
    }
  }

  async function handleSaveTodo(draft) {
    const dueDateInput = parseOptionalDateInput(draft.dueDate, { fieldLabel: "期限日" });
    if (!dueDateInput.isValid) {
      const error = createAppError("INVALID_TODO_DUE_DATE", dueDateInput.error);
      handleKnownError(error, "ToDo を保存できませんでした。");
      throw error;
    }
    const nextDraft = { ...draft, dueDate: dueDateInput.normalized };
    try {
      const result = await withBusy(() => saveTodo(nextDraft));
      patchSavedTodoCaches(result.todo, { previousStatus: result.previousStatus });
      pushToast({ tone: "success", title: "ToDo を保存しました。" });
      runDeferredRefresh(
        () => Promise.all([
          refreshDashboard(currentTermKey),
          refreshTimetable(currentTermKey),
          refreshTodosPage(currentTermKey),
          refreshSelectedSubjectSlice(nextDraft.subjectId, { todos: true }),
        ]),
        { title: "ToDo は保存済みですが、表示更新に失敗しました。" },
      );
    } catch (error) {
      if (error?.code === "STALE_DRAFT" || error?.code === "STALE_UPDATE") {
        await handleStaleRecovery(error, {
          message: "この ToDo は別の画面で更新または削除されています。開き直してから編集してください。",
          fallbackTitle: "ToDo を保存できませんでした。",
          resync: () => Promise.all([
            refreshDashboard(currentTermKey),
            refreshTimetable(currentTermKey),
            refreshTodosPage(currentTermKey),
            refreshSelectedSubjectSlice(nextDraft.subjectId, { todos: true }),
          ]),
          resyncFailureTitle: "ToDo の再同期に失敗しました。",
        });
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
      const deletedTodo = await withBusy(() => deleteTodo(todo.id));
      removeTodoFromCaches(deletedTodo, { fallbackStatus: deletedTodo.status });
      pushToast({ tone: "success", title: "ToDo を削除しました。" });
      runDeferredRefresh(
        () => Promise.all([
          refreshDashboard(currentTermKey),
          refreshTimetable(currentTermKey),
          refreshTodosPage(currentTermKey),
          refreshSelectedSubjectSlice(deletedTodo.subjectId, { todos: true }),
        ]),
        { title: "ToDo は削除済みですが、表示更新に失敗しました。" },
      );
      return { status: "deleted" };
    } catch (error) {
      if (error?.code === "STALE_DRAFT") {
        dropTodoFromVisibleCaches(todo);
        runDeferredRefresh(
          () => Promise.all([
            refreshDashboard(currentTermKey),
            refreshTimetable(currentTermKey),
            refreshTodosPage(currentTermKey),
            refreshSelectedSubjectSlice(todo.subjectId, { todos: true }),
          ]),
          { title: "ToDo の再同期に失敗しました。" },
        );
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

    const selectedSubjectIdSnapshot = selectedSubjectId;
    try {
      const shouldRefreshSelectedSubject = Boolean(selectedSubjectIdSnapshot) && draft.currentTermKey.trim() === currentTermKey;
      await withBusy(() =>
        saveSettingsBundle({
          draftSettings: draft,
          draftPeriods: draft.periods,
          periodsLoadedForTermKey,
        }),
      );
      const nextSettings = await getSettings();
      setSettings(nextSettings);
      pushToast({ tone: "success", title: "設定を保存しました。" });
      runDeferredRefresh(
        async () => {
          await Promise.all([
            refreshDashboard(nextSettings.currentTermKey),
            refreshTimetable(nextSettings.currentTermKey),
            refreshLibrary(nextSettings.currentTermKey),
            refreshTodosPage(nextSettings.currentTermKey),
          ]);
          if (shouldRefreshSelectedSubject) {
            await refreshSelectedSubjectSlice(selectedSubjectIdSnapshot);
          }
        },
        { title: "設定は保存済みですが、表示更新に失敗しました。" },
      );
    } catch (error) {
      if (error?.code === "STALE_UPDATE") {
        await handleStaleRecovery(error, {
          message: "設定は別の画面で更新されています。",
          fallbackTitle: "設定は別の画面で更新されています。",
          resync: async () => {
            const nextSettings = await getSettings();
            setSettings(nextSettings);
            await Promise.all([
              refreshDashboard(nextSettings.currentTermKey),
              refreshTimetable(nextSettings.currentTermKey),
              refreshLibrary(nextSettings.currentTermKey),
              refreshTodosPage(nextSettings.currentTermKey),
            ]);
            if (selectedSubjectIdSnapshot) {
              await refreshSelectedSubjectSlice(selectedSubjectIdSnapshot);
            }
          },
          resyncFailureTitle: "設定の再同期に失敗しました。",
        });
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
      const exportedMetadataOnly = result.artifact?.includesMaterialFiles === false && result.materialsCount > 0;
      pushToast({
        tone: exportedMetadataOnly ? "info" : result.missingFiles?.length ? "warning" : "success",
        title: exportedMetadataOnly
          ? "資料メタ情報のみでエクスポートしました。"
          : result.missingFiles?.length
            ? "欠損を除いてエクスポートしました。"
            : "エクスポートを開始しました。",
        description: exportedMetadataOnly
          ? "資料ファイルは含めず、資料名やメモのみを書き出しました。"
          : result.missingFiles?.length
            ? `存在する資料ファイルは含め、欠損していた ${result.missingFiles.length} 件だけ除外しました。`
            : "",
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
            存在するファイルだけで続行
          </IconButton>
        </div>
      </Modal>

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

export default App;
