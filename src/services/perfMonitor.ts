import { exportCache } from './exportCache';

export interface PerfSample {
  ts: number;
  cpuBusyPct: number;
  loopLagMs: number;
  fps: number;
  usedHeapMB: number | null;
  totalHeapMB: number | null;
  heapLimitMB: number | null;
  cacheMB: number;
  longTasksInWindow: number;
  isExporting: boolean;
}

export interface ExportTaskPerfProfile {
  id: string;
  kind: string;
  title: string;
  status: 'success' | 'error';
  durationMs: number;
  peakCpuPct: number;
  avgCpuPct: number;
  peakLagMs: number;
  minFps: number;
  peakHeapMB: number | null;
  heapDeltaMB: number | null;
  longTasks: number;
  yieldCount: number;
  cacheHitRatePct: number;
  finishedAt: number;
}

export interface PerfMonitorSnapshot {
  samples: PerfSample[];
  latest: PerfSample | null;
  heapSupported: boolean;
  longTaskSupported: boolean;
  totalLongTasks: number;
  isSampling: boolean;
  isPaused: boolean;
  profiles: ExportTaskPerfProfile[];
}

interface ChromePerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface ActiveProfileAccumulator {
  id: string;
  kind: string;
  title: string;
  startedAt: number;
  startHits: number;
  startMisses: number;
  startHeapMB: number | null;
  peakHeapMB: number | null;
  peakCpuPct: number;
  cpuSum: number;
  cpuSamples: number;
  peakLagMs: number;
  minFps: number;
  longTasks: number;
  yieldCount: number;
  lastYieldAt: number;
  workSliceMsInWindow: number;
}

const MAX_SAMPLES = 48; // ~24 seconds at 500ms interval
const MAX_PROFILES = 8;
const SAMPLE_INTERVAL_MS = 500;
const PROBE_STEP_MS = 50;

function readHeapMemory(): {
  supported: boolean;
  usedMB: number | null;
  totalMB: number | null;
  limitMB: number | null;
} {
  const perf = performance as unknown as { memory?: ChromePerformanceMemory };
  if (!perf?.memory || typeof perf.memory.usedJSHeapSize !== 'number') {
    return { supported: false, usedMB: null, totalMB: null, limitMB: null };
  }
  const toMB = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10;
  return {
    supported: true,
    usedMB: toMB(perf.memory.usedJSHeapSize),
    totalMB: toMB(perf.memory.totalJSHeapSize),
    limitMB: toMB(perf.memory.jsHeapSizeLimit),
  };
}

class ExportPerfMonitor {
  private samples: PerfSample[] = [];
  private profiles: ExportTaskPerfProfile[] = [];
  private listeners = new Set<() => void>();
  private dashboardWatchers = 0;
  private isPaused = false;

  private activeProfile: ActiveProfileAccumulator | null = null;
  private probeTimer: number | null = null;
  private sampleTimer: number | null = null;
  private rafId: number | null = null;
  private longTaskObserver: PerformanceObserver | null = null;

  private lastProbeAt = 0;
  private accumulatedDriftMs = 0;
  private maxLagInWindow = 0;
  private rafFramesInWindow = 0;
  private longTaskDurationInWindow = 0;
  private longTasksInWindow = 0;
  private totalLongTasks = 0;
  private windowStartAt = 0;
  private longTaskSupported = false;

  constructor() {
    this.longTaskSupported =
      typeof PerformanceObserver !== 'undefined' &&
      Array.isArray(PerformanceObserver.supportedEntryTypes) &&
      PerformanceObserver.supportedEntryTypes.includes('longtask');
  }

  subscribe(listener: () => void, asDashboardWatcher = false): () => void {
    this.listeners.add(listener);
    if (asDashboardWatcher) {
      this.dashboardWatchers += 1;
      this.syncSamplerState();
    }
    return () => {
      this.listeners.delete(listener);
      if (asDashboardWatcher) {
        this.dashboardWatchers = Math.max(0, this.dashboardWatchers - 1);
        this.syncSamplerState();
      }
    };
  }

  private notify(): void {
    for (const fn of this.listeners) {
      fn();
    }
  }

  getSnapshot(): PerfMonitorSnapshot {
    const heap = readHeapMemory();
    return {
      samples: this.samples,
      latest: this.samples.length > 0 ? this.samples[this.samples.length - 1] : null,
      heapSupported: heap.supported,
      longTaskSupported: this.longTaskSupported,
      totalLongTasks: this.totalLongTasks,
      isSampling: this.sampleTimer !== null,
      isPaused: this.isPaused,
      profiles: this.profiles,
    };
  }

  setPaused(paused: boolean): void {
    this.isPaused = paused;
    this.syncSamplerState();
    this.notify();
  }

  clearHistory(): void {
    this.samples = [];
    this.profiles = [];
    this.totalLongTasks = 0;
    this.notify();
  }

  beginTaskProfile(id: string, kind: string, title: string): void {
    const cacheStats = exportCache.getStats();
    const heap = readHeapMemory();
    const now = performance.now();
    this.activeProfile = {
      id,
      kind,
      title,
      startedAt: now,
      startHits: cacheStats.hits,
      startMisses: cacheStats.misses,
      startHeapMB: heap.usedMB,
      peakHeapMB: heap.usedMB,
      peakCpuPct: 0,
      cpuSum: 0,
      cpuSamples: 0,
      peakLagMs: 0,
      minFps: 60,
      longTasks: 0,
      yieldCount: 0,
      lastYieldAt: now,
      workSliceMsInWindow: 0,
    };
    this.syncSamplerState();
    this.notify();
  }

  recordExportYield(taskId: string): void {
    if (!this.activeProfile || this.activeProfile.id !== taskId) return;
    const now = performance.now();
    const slice = Math.max(0, now - this.activeProfile.lastYieldAt);
    this.activeProfile.yieldCount += 1;
    // Cap synthetic slice contribution to realistic synchronous execution bursts
    if (this.activeProfile.kind !== 'simulated') {
      this.activeProfile.workSliceMsInWindow += Math.min(slice, 120);
    }
    this.activeProfile.lastYieldAt = now;
  }

  markExportResumed(taskId: string): void {
    if (!this.activeProfile || this.activeProfile.id !== taskId) return;
    this.activeProfile.lastYieldAt = performance.now();
  }

  endTaskProfile(id: string, status: 'success' | 'error'): void {
    if (!this.activeProfile || this.activeProfile.id !== id) return;
    const prof = this.activeProfile;
    const now = performance.now();
    const durationMs = Math.max(1, Math.round(now - prof.startedAt));
    const heap = readHeapMemory();
    const cacheStats = exportCache.getStats();
    const deltaHits = Math.max(0, cacheStats.hits - prof.startHits);
    const deltaMisses = Math.max(0, cacheStats.misses - prof.startMisses);
    const totalCacheOps = deltaHits + deltaMisses;
    const cacheHitRatePct =
      totalCacheOps > 0 ? Math.round((deltaHits / totalCacheOps) * 100) : cacheStats.hitRatePct;

    const latestSample = this.samples[this.samples.length - 1];
    const avgCpuPct =
      prof.cpuSamples > 0
        ? Math.round(prof.cpuSum / prof.cpuSamples)
        : latestSample?.cpuBusyPct ?? 0;

    const peakHeapMB =
      heap.usedMB !== null && prof.peakHeapMB !== null
        ? Math.max(heap.usedMB, prof.peakHeapMB)
        : prof.peakHeapMB ?? heap.usedMB;

    const heapDeltaMB =
      heap.usedMB !== null && prof.startHeapMB !== null
        ? Math.round((heap.usedMB - prof.startHeapMB) * 10) / 10
        : null;

    const record: ExportTaskPerfProfile = {
      id: prof.id,
      kind: prof.kind,
      title: prof.title,
      status,
      durationMs,
      peakCpuPct: prof.peakCpuPct || avgCpuPct,
      avgCpuPct,
      peakLagMs: Math.round(prof.peakLagMs),
      minFps: prof.cpuSamples > 0 ? prof.minFps : latestSample?.fps ?? 60,
      peakHeapMB,
      heapDeltaMB,
      longTasks: prof.longTasks,
      yieldCount: prof.yieldCount,
      cacheHitRatePct,
      finishedAt: Date.now(),
    };

    this.profiles = [record, ...this.profiles].slice(0, MAX_PROFILES);
    this.activeProfile = null;
    this.syncSamplerState();
    this.notify();
  }

  private shouldSample(): boolean {
    if (this.isPaused && !this.activeProfile) return false;
    return this.dashboardWatchers > 0 || this.activeProfile !== null;
  }

  private syncSamplerState(): void {
    if (this.shouldSample()) {
      this.startSampling();
    } else {
      this.stopSampling();
    }
  }

  private startSampling(): void {
    if (this.sampleTimer !== null) return;

    this.windowStartAt = performance.now();
    this.lastProbeAt = this.windowStartAt;
    this.accumulatedDriftMs = 0;
    this.maxLagInWindow = 0;
    this.rafFramesInWindow = 0;
    this.longTaskDurationInWindow = 0;
    this.longTasksInWindow = 0;

    if (this.longTaskSupported && !this.longTaskObserver) {
      try {
        this.longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.longTaskDurationInWindow += entry.duration;
            this.longTasksInWindow += 1;
            this.totalLongTasks += 1;
            if (this.activeProfile) {
              this.activeProfile.longTasks += 1;
            }
          }
        });
        this.longTaskObserver.observe({ type: 'longtask', buffered: false });
      } catch {
        this.longTaskObserver = null;
      }
    }

    const tickRaf = () => {
      this.rafFramesInWindow += 1;
      this.rafId = window.requestAnimationFrame(tickRaf);
    };
    this.rafId = window.requestAnimationFrame(tickRaf);

    // Lightweight 50ms drift probe to measure real main-thread event loop blockage
    this.probeTimer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - this.lastProbeAt;
      const lag = Math.max(0, elapsed - PROBE_STEP_MS);
      this.accumulatedDriftMs += lag;
      if (lag > this.maxLagInWindow) {
        this.maxLagInWindow = lag;
      }
      this.lastProbeAt = now;
    }, PROBE_STEP_MS);

    this.sampleTimer = window.setInterval(() => {
      this.flushWindowSample();
    }, SAMPLE_INTERVAL_MS);
  }

  private stopSampling(): void {
    if (this.probeTimer !== null) {
      window.clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
    if (this.sampleTimer !== null) {
      window.clearInterval(this.sampleTimer);
      this.sampleTimer = null;
    }
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.longTaskObserver) {
      try {
        this.longTaskObserver.disconnect();
      } catch {
        // ignore
      }
      this.longTaskObserver = null;
    }
  }

  private flushWindowSample(): void {
    const now = performance.now();
    const windowMs = Math.max(100, now - this.windowStartAt);
    const fps = Math.min(120, Math.round((this.rafFramesInWindow / windowMs) * 1000));

    // Combine real event-loop blockage signals into main-thread CPU busy %
    const sliceBusyMs = this.activeProfile ? this.activeProfile.workSliceMsInWindow : 0;
    const busyMs = Math.min(
      windowMs,
      Math.max(this.accumulatedDriftMs, this.longTaskDurationInWindow) + sliceBusyMs * 0.45
    );
    const cpuBusyPct = Math.min(100, Math.max(0, Math.round((busyMs / windowMs) * 100)));

    const heap = readHeapMemory();
    const cacheStats = exportCache.getStats();
    const cacheMB = Math.round((cacheStats.estimatedBytes / (1024 * 1024)) * 100) / 100;

    const sample: PerfSample = {
      ts: Date.now(),
      cpuBusyPct,
      loopLagMs: Math.round(this.maxLagInWindow * 10) / 10,
      fps,
      usedHeapMB: heap.usedMB,
      totalHeapMB: heap.totalMB,
      heapLimitMB: heap.limitMB,
      cacheMB,
      longTasksInWindow: this.longTasksInWindow,
      isExporting: this.activeProfile !== null,
    };

    this.samples = [...this.samples.slice(-(MAX_SAMPLES - 1)), sample];

    if (this.activeProfile) {
      this.activeProfile.cpuSum += cpuBusyPct;
      this.activeProfile.cpuSamples += 1;
      if (cpuBusyPct > this.activeProfile.peakCpuPct) {
        this.activeProfile.peakCpuPct = cpuBusyPct;
      }
      if (sample.loopLagMs > this.activeProfile.peakLagMs) {
        this.activeProfile.peakLagMs = sample.loopLagMs;
      }
      if (fps < this.activeProfile.minFps) {
        this.activeProfile.minFps = fps;
      }
      if (
        heap.usedMB !== null &&
        (this.activeProfile.peakHeapMB === null || heap.usedMB > this.activeProfile.peakHeapMB)
      ) {
        this.activeProfile.peakHeapMB = heap.usedMB;
      }
      this.activeProfile.workSliceMsInWindow = 0;
    }

    // Reset window accumulators
    this.windowStartAt = now;
    this.lastProbeAt = now;
    this.accumulatedDriftMs = 0;
    this.maxLagInWindow = 0;
    this.rafFramesInWindow = 0;
    this.longTaskDurationInWindow = 0;
    this.longTasksInWindow = 0;

    this.notify();
  }
}

export const perfMonitor = new ExportPerfMonitor();
