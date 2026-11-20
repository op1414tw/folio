import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { perfMonitor } from '../services/perfMonitor';

export type ExportTaskKind = 'pdf' | 'zip' | 'json' | 'card' | 'simulated';
export type ExportTaskPriority = 'normal' | 'high';

export const MAX_EXPORT_QUEUE_SIZE = 5;

export interface ActiveExportTask {
  id: string;
  kind: ExportTaskKind;
  priority: ExportTaskPriority;
  title: string;
  pct: number;
  label: string;
  startedAt: number;
}

export interface QueuedExportTaskSummary {
  id: string;
  kind: ExportTaskKind;
  priority: ExportTaskPriority;
  title: string;
  createdAt: number;
}

export interface ExportCompletionNotice {
  id: string;
  kind: ExportTaskKind;
  title: string;
  status: 'success' | 'error';
  message: string;
  finishedAt: number;
}

export interface ExportRunHelpers {
  onProgress: (label: string, pct: number) => void;
  yieldAndRespectPriority: () => Promise<void>;
}

export interface EnqueueExportRequest {
  kind: ExportTaskKind;
  priority?: ExportTaskPriority;
  title: string;
  run: (helpers: ExportRunHelpers) => Promise<string>;
}

export interface EnqueueExportResult {
  accepted: boolean;
  status: 'started' | 'queued' | 'full';
  position: number;
  message: string;
}

interface InternalQueueEntry extends QueuedExportTaskSummary {
  run: (helpers: ExportRunHelpers) => Promise<string>;
}

interface ExportQueueContextValue {
  activeTask: ActiveExportTask | null;
  queuedTasks: QueuedExportTaskSummary[];
  lastNotice: ExportCompletionNotice | null;
  isCardExportingPriority: boolean;
  enqueueTask: (req: EnqueueExportRequest) => EnqueueExportResult;
  cancelQueuedTask: (taskId: string) => void;
  dismissNotice: () => void;
  runPriorityCardExport: <T>(fn: () => Promise<T>, label?: string) => Promise<T>;
}

const ExportQueueContext = createContext<ExportQueueContextValue | null>(null);

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export const ExportQueueProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTask, setActiveTask] = useState<ActiveExportTask | null>(null);
  const [queuedTasks, setQueuedTasks] = useState<QueuedExportTaskSummary[]>([]);
  const [lastNotice, setLastNotice] = useState<ExportCompletionNotice | null>(null);
  const [isCardExportingPriority, setIsCardExportingPriority] = useState(false);

  const activeRef = useRef<ActiveExportTask | null>(null);
  const queueRef = useRef<InternalQueueEntry[]>([]);
  const priorityActiveCountRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const syncQueueState = useCallback(() => {
    if (!mountedRef.current) return;
    setQueuedTasks(
      queueRef.current.map(({ id, kind, priority, title, createdAt }) => ({
        id,
        kind,
        priority,
        title,
        createdAt,
      }))
    );
  }, []);

  const startEntry = useCallback(
    (entry: InternalQueueEntry) => {
      const nextActive: ActiveExportTask = {
        id: entry.id,
        kind: entry.kind,
        priority: entry.priority,
        title: entry.title,
        pct: 1,
        label: '正在準備匯出任務...',
        startedAt: Date.now(),
      };
      activeRef.current = nextActive;
      perfMonitor.beginTaskProfile(entry.id, entry.kind, entry.title);
      if (mountedRef.current) {
        setActiveTask(nextActive);
      }

      const helpers: ExportRunHelpers = {
        onProgress: (label: string, pct: number) => {
          const clamped = Math.max(0, Math.min(100, Math.round(pct)));
          if (activeRef.current?.id !== entry.id) return;
          const updated: ActiveExportTask = {
            ...activeRef.current,
            label,
            pct: clamped,
          };
          activeRef.current = updated;
          if (mountedRef.current) {
            setActiveTask(updated);
          }
        },
        yieldAndRespectPriority: async () => {
          perfMonitor.recordExportYield(entry.id);
          // Yield to the browser paint/input queue so UI stays interactive
          await sleep(0);
          // Pause heavy background export politely while a Share Card export is executing
          while (priorityActiveCountRef.current > 0 && mountedRef.current) {
            await sleep(50);
          }
          perfMonitor.markExportResumed(entry.id);
        },
      };

      void (async () => {
        try {
          const message = await entry.run(helpers);
          perfMonitor.endTaskProfile(entry.id, 'success');
          if (mountedRef.current) {
            setLastNotice({
              id: entry.id,
              kind: entry.kind,
              title: entry.title,
              status: 'success',
              message,
              finishedAt: Date.now(),
            });
          }
        } catch (err) {
          perfMonitor.endTaskProfile(entry.id, 'error');
          if (mountedRef.current) {
            setLastNotice({
              id: entry.id,
              kind: entry.kind,
              title: entry.title,
              status: 'error',
              message: err instanceof Error ? err.message : '匯出任務發生錯誤',
              finishedAt: Date.now(),
            });
          }
        } finally {
          const nextEntry = queueRef.current.shift();
          syncQueueState();
          if (nextEntry && mountedRef.current) {
            startEntry(nextEntry);
          } else {
            activeRef.current = null;
            if (mountedRef.current) {
              setActiveTask(null);
            }
          }
        }
      })();
    },
    [syncQueueState]
  );

  const enqueueTask = useCallback(
    (req: EnqueueExportRequest): EnqueueExportResult => {
      const priority: ExportTaskPriority = req.priority ?? 'normal';
      const entry: InternalQueueEntry = {
        id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        kind: req.kind,
        priority,
        title: req.title,
        createdAt: Date.now(),
        run: req.run,
      };

      if (!activeRef.current) {
        startEntry(entry);
        return {
          accepted: true,
          status: 'started',
          position: 0,
          message: `已開始執行「${req.title}」`,
        };
      }

      if (priority === 'high') {
        if (queueRef.current.length >= MAX_EXPORT_QUEUE_SIZE) {
          // Make room for high-priority single-work export by removing the oldest-back normal entry if present
          let normalTailIdx = -1;
          for (let i = queueRef.current.length - 1; i >= 0; i--) {
            if (queueRef.current[i].priority !== 'high') {
              normalTailIdx = i;
              break;
            }
          }
          if (normalTailIdx === -1) {
            return {
              accepted: false,
              status: 'full',
              position: queueRef.current.length,
              message: `高優先等待隊列已滿（${MAX_EXPORT_QUEUE_SIZE}/${MAX_EXPORT_QUEUE_SIZE}），請稍候再試。`,
            };
          }
          queueRef.current.splice(normalTailIdx, 1);
        }

        // Insert directly at the very front of the queue ahead of all queued batch tasks
        queueRef.current.unshift(entry);
        syncQueueState();
        return {
          accepted: true,
          status: 'queued',
          position: 1,
          message: `已將高優先級任務「${req.title}」插入佇列最前方（第 1 位），目前任務完成後將立即執行。`,
        };
      }

      if (queueRef.current.length >= MAX_EXPORT_QUEUE_SIZE) {
        return {
          accepted: false,
          status: 'full',
          position: queueRef.current.length,
          message: `等待隊列已滿（最多同時排隊 ${MAX_EXPORT_QUEUE_SIZE} 個任務），請稍候目前任務完成後再試。`,
        };
      }

      queueRef.current.push(entry);
      const pos = queueRef.current.length;
      syncQueueState();
      return {
        accepted: true,
        status: 'queued',
        position: pos,
        message: `已有任務進行中，「${req.title}」已排入隊列（第 ${pos} 位等待）。`,
      };
    },
    [startEntry, syncQueueState]
  );

  const cancelQueuedTask = useCallback(
    (taskId: string) => {
      const before = queueRef.current.length;
      queueRef.current = queueRef.current.filter((item) => item.id !== taskId);
      if (queueRef.current.length !== before) {
        syncQueueState();
      }
    },
    [syncQueueState]
  );

  const dismissNotice = useCallback(() => {
    setLastNotice(null);
  }, []);

  const runPriorityCardExport = useCallback(async <T,>(fn: () => Promise<T>, _label?: string): Promise<T> => {
    priorityActiveCountRef.current += 1;
    if (mountedRef.current) {
      setIsCardExportingPriority(true);
    }
    try {
      // Give any currently yielding export step 1 animation frame to pause cleanly
      await sleep(16);
      return await fn();
    } finally {
      priorityActiveCountRef.current = Math.max(0, priorityActiveCountRef.current - 1);
      if (priorityActiveCountRef.current === 0 && mountedRef.current) {
        setIsCardExportingPriority(false);
      }
    }
  }, []);

  const value = useMemo<ExportQueueContextValue>(
    () => ({
      activeTask,
      queuedTasks,
      lastNotice,
      isCardExportingPriority,
      enqueueTask,
      cancelQueuedTask,
      dismissNotice,
      runPriorityCardExport,
    }),
    [
      activeTask,
      queuedTasks,
      lastNotice,
      isCardExportingPriority,
      enqueueTask,
      cancelQueuedTask,
      dismissNotice,
      runPriorityCardExport,
    ]
  );

  return <ExportQueueContext.Provider value={value}>{children}</ExportQueueContext.Provider>;
};

export function useExportQueue(): ExportQueueContextValue {
  const ctx = useContext(ExportQueueContext);
  if (!ctx) {
    throw new Error('useExportQueue must be used within ExportQueueProvider');
  }
  return ctx;
}
