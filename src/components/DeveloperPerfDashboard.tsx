import React, { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import {
  Activity,
  Cpu,
  Database,
  FileDown,
  HardDrive,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { exportCache, ExportCacheStats } from '../services/exportCache';
import { perfMonitor, PerfMonitorSnapshot } from '../services/perfMonitor';
import {
  getCrashIncidents,
  clearCrashIncidents,
  recordCrashIncident,
  isSafeModeActive,
  setSafeModeActive,
} from '../services/recoveryService';

interface DeveloperPerfDashboardProps {
  isExporting: boolean;
  onPrewarmCache: () => Promise<number>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const DeveloperPerfDashboard: React.FC<DeveloperPerfDashboardProps> = ({
  isExporting,
  onPrewarmCache,
}) => {
  const [perf, setPerf] = useState<PerfMonitorSnapshot>(() => perfMonitor.getSnapshot());
  const [cacheStats, setCacheStats] = useState<ExportCacheStats>(() => exportCache.getStats());
  const [prewarming, setPrewarming] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);
  const [actionNote, setActionNote] = useState('');
  const [incidentCount, setIncidentCount] = useState<number>(() => getCrashIncidents().length);
  const [safeMode, setSafeMode] = useState<boolean>(() => isSafeModeActive());

  useEffect(() => {
    setPerf(perfMonitor.getSnapshot());
    setCacheStats(exportCache.getStats());
    const unsubPerf = perfMonitor.subscribe(() => {
      setPerf(perfMonitor.getSnapshot());
    }, true);
    const unsubCache = exportCache.subscribe(() => {
      setCacheStats(exportCache.getStats());
    });
    return () => {
      unsubPerf();
      unsubCache();
    };
  }, []);

  const latest = perf.latest;
  const peakCpu = useMemo(
    () => perf.samples.reduce((max, s) => Math.max(max, s.cpuBusyPct), 0),
    [perf.samples]
  );
  const peakLag = useMemo(
    () => perf.samples.reduce((max, s) => Math.max(max, s.loopLagMs), 0),
    [perf.samples]
  );

  const heapPct =
    latest?.usedHeapMB != null && latest?.heapLimitMB
      ? Math.min(100, Math.round((latest.usedHeapMB / latest.heapLimitMB) * 100))
      : null;

  const cacheUsagePct =
    cacheStats.maxBytes > 0
      ? Math.min(100, Math.round((cacheStats.estimatedBytes / cacheStats.maxBytes) * 100))
      : 0;

  // Build SVG polyline points for CPU % and Heap MB
  const chartGeometry = useMemo(() => {
    const W = 480;
    const H = 112;
    const padY = 8;
    const innerH = H - padY * 2;
    const samples = perf.samples;
    if (samples.length < 2) {
      return {
        W,
        H,
        cpuPath: '',
        cpuAreaPath: '',
        memPath: '',
        exportBands: [] as { x: number; w: number }[],
        maxMemLabel: 0,
      };
    }

    const stepX = W / Math.max(1, samples.length - 1);
    const maxObservedHeap = samples.reduce(
      (max, s) => Math.max(max, s.usedHeapMB ?? s.cacheMB),
      16
    );
    const memCeiling = Math.max(32, Math.ceil(maxObservedHeap / 16) * 16);

    const cpuPts: string[] = [];
    const memPts: string[] = [];
    const exportBands: { x: number; w: number }[] = [];
    let bandStart: number | null = null;

    samples.forEach((s, idx) => {
      const x = Number((idx * stepX).toFixed(1));
      const cpuY = Number((padY + innerH * (1 - Math.min(100, s.cpuBusyPct) / 100)).toFixed(1));
      const memVal = s.usedHeapMB ?? s.cacheMB;
      const memY = Number(
        (padY + innerH * (1 - Math.min(1, memVal / memCeiling))).toFixed(1)
      );
      cpuPts.push(`${x},${cpuY}`);
      memPts.push(`${x},${memY}`);

      if (s.isExporting && bandStart === null) {
        bandStart = x;
      } else if (!s.isExporting && bandStart !== null) {
        exportBands.push({ x: bandStart, w: Math.max(4, x - bandStart) });
        bandStart = null;
      }
    });
    if (bandStart !== null) {
      exportBands.push({ x: bandStart, w: Math.max(4, W - bandStart) });
    }

    const cpuPath = `M ${cpuPts.join(' L ')}`;
    const cpuAreaPath = `${cpuPath} L ${W},${H - padY} L 0,${H - padY} Z`;
    const memPath = `M ${memPts.join(' L ')}`;

    return {
      W,
      H,
      cpuPath,
      cpuAreaPath,
      memPath,
      exportBands,
      maxMemLabel: memCeiling,
    };
  }, [perf.samples]);

  const handleManualPrewarm = async () => {
    setPrewarming(true);
    setActionNote('');
    try {
      const added = await onPrewarmCache();
      setCacheStats(exportCache.getStats());
      setActionNote(
        added > 0 ? `已預熱快取 ${added} 件作品物件。` : '所有未鎖定作品皆已在快取中。'
      );
    } finally {
      setPrewarming(false);
    }
  };

  const handleClearMemoryCache = () => {
    const beforeBytes = exportCache.getStats().estimatedBytes;
    exportCache.clear();
    setCacheStats(exportCache.getStats());
    setActionNote(`已清理記憶體快取（釋放 ${formatBytes(beforeBytes)}，快取統計已重置）。`);
  };

  const handleExportPerfReportJson = async () => {
    setExportingReport(true);
    setActionNote('');
    try {
      const currentPerf = perfMonitor.getSnapshot();
      const currentCache = exportCache.getStats();
      const sampleCount = currentPerf.samples.length;
      const avgCpuBusyPct =
        sampleCount > 0
          ? Math.round(
              currentPerf.samples.reduce((s, item) => s + item.cpuBusyPct, 0) / sampleCount
            )
          : 0;
      const avgLoopLagMs =
        sampleCount > 0
          ? Math.round(
              (currentPerf.samples.reduce((s, item) => s + item.loopLagMs, 0) / sampleCount) * 10
            ) / 10
          : 0;
      const minFps =
        sampleCount > 0
          ? currentPerf.samples.reduce((min, item) => Math.min(min, item.fps), 120)
          : 0;
      const heapValues = currentPerf.samples
        .map((s) => s.usedHeapMB)
        .filter((v): v is number => v !== null);
      const peakUsedHeapMB =
        heapValues.length > 0 ? Math.max(...heapValues) : currentPerf.latest?.usedHeapMB ?? null;
      const avgUsedHeapMB =
        heapValues.length > 0
          ? Math.round((heapValues.reduce((a, b) => a + b, 0) / heapValues.length) * 10) / 10
          : null;

      const nav = navigator as Navigator & { deviceMemory?: number };
      const report = {
        format: 'folio-perf-report-v1',
        exportedAt: new Date().toISOString(),
        exportedAtLocal: new Date().toLocaleString('zh-TW'),
        environment: {
          platform: Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web',
          userAgent: navigator.userAgent,
          hardwareConcurrency: navigator.hardwareConcurrency ?? null,
          deviceMemoryGB: nav.deviceMemory ?? null,
          heapSupported: currentPerf.heapSupported,
          longTaskSupported: currentPerf.longTaskSupported,
        },
        summary: {
          sampleCount,
          totalLongTasks: currentPerf.totalLongTasks,
          avgCpuBusyPct,
          peakCpuBusyPct: peakCpu,
          avgLoopLagMs,
          peakLoopLagMs: peakLag,
          minFps,
          avgUsedHeapMB,
          peakUsedHeapMB,
          currentCacheBytes: currentCache.estimatedBytes,
          cacheHitRatePct: currentCache.hitRatePct,
          recordedTaskCount: currentPerf.profiles.length,
        },
        cacheStats: currentCache,
        taskProfiles: currentPerf.profiles,
        samples: currentPerf.samples,
      };

      const jsonText = JSON.stringify(report, null, 2);
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
        now.getDate()
      ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(
        now.getMinutes()
      ).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      const filename = `folio_perf_report_${stamp}.json`;

      if (Capacitor.isNativePlatform()) {
        try {
          const perm = await Filesystem.checkPermissions();
          if (perm.publicStorage !== 'granted') {
            await Filesystem.requestPermissions();
          }
        } catch {
          // Scoped storage fallback
        }
        const path = `FolioReports/${filename}`;
        await Filesystem.writeFile({
          path,
          data: jsonText,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
          recursive: true,
        });
        setActionNote(`已直接儲存效能報告至 文件/FolioReports/${filename}`);
      } else {
        const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setActionNote(`已匯出效能監控 JSON 報告 (${filename})`);
      }
    } catch (err) {
      setActionNote(err instanceof Error ? `匯出失敗：${err.message}` : '效能報告匯出失敗');
    } finally {
      setExportingReport(false);
    }
  };

  return (
    <div className="p-4 rounded-xl bg-white dark:bg-[#1E1E1C] border border-stone-200/80 dark:border-stone-800 space-y-4">
      {/* Header & Sampling Controls */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Activity className="w-4 h-4 text-[#284152] dark:text-[#E7E5E0] shrink-0" />
            <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              效能分析儀表板
            </h4>
            <span className="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
              {perf.isPaused
                ? '已暫停'
                : isExporting
                ? '匯出監控中'
                : '即時採樣中 (500ms)'}
            </span>
          </div>
          <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
            監控匯出任務期間主執行緒 CPU 負載、事件迴圈延遲、JS 記憶體配置與快取命中率。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => perfMonitor.setPaused(!perf.isPaused)}
            className="min-h-[36px] px-3 rounded-lg border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 inline-flex items-center gap-1.5 hover:bg-stone-50 dark:hover:bg-stone-800 whitespace-nowrap"
          >
            {perf.isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{perf.isPaused ? '恢復採樣' : '暫停'}</span>
          </button>
          <button
            type="button"
            onClick={() => perfMonitor.clearHistory()}
            className="min-h-[36px] px-3 rounded-lg border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-600 dark:text-stone-300 inline-flex items-center gap-1.5 hover:bg-stone-50 dark:hover:bg-stone-800 whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>清空曲線</span>
          </button>
          <button
            type="button"
            onClick={handleClearMemoryCache}
            className="min-h-[36px] px-3 rounded-lg border border-[#9E3B33]/35 text-xs font-medium text-[#9E3B33] dark:text-[#E07A70] inline-flex items-center gap-1.5 hover:bg-[#9E3B33]/5 whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>清理記憶體快取</span>
          </button>
          <button
            type="button"
            disabled={exportingReport}
            onClick={() => void handleExportPerfReportJson()}
            className="min-h-[36px] px-3 rounded-lg bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium inline-flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>{exportingReport ? '匯出中...' : '匯出效能報告 (.json)'}</span>
          </button>
        </div>
      </div>

      {actionNote && (
        <p className="text-[11px] text-[#284152] dark:text-stone-200 font-medium bg-[#F7F6F2] dark:bg-[#242422] px-3 py-2 rounded-lg">
          {actionNote}
        </p>
      )}

      {/* 4 Live Telemetry Readouts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-xl bg-[#F7F6F2] dark:bg-[#242422] space-y-1">
          <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400">
            <span>主執行緒 CPU</span>
            <Cpu className="w-3.5 h-3.5" />
          </div>
          <div className="font-mono text-xl font-semibold tabular-nums text-stone-900 dark:text-stone-100">
            {latest ? `${latest.cpuBusyPct}%` : '--'}
          </div>
          <div className="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
            峰值 {peakCpu}% · 長任務 {perf.totalLongTasks}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#F7F6F2] dark:bg-[#242422] space-y-1">
          <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400">
            <span>JS 記憶體用量</span>
            <HardDrive className="w-3.5 h-3.5" />
          </div>
          <div className="font-mono text-xl font-semibold tabular-nums text-stone-900 dark:text-stone-100">
            {latest?.usedHeapMB != null
              ? `${latest.usedHeapMB} MB`
              : `${formatBytes(cacheStats.estimatedBytes)}`}
          </div>
          <div className="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums truncate">
            {latest?.usedHeapMB != null && latest.heapLimitMB != null
              ? `配額 ${latest.heapLimitMB} MB (${heapPct}%)`
              : '未開放 Heap API · 顯示快取占用'}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#F7F6F2] dark:bg-[#242422] space-y-1">
          <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400">
            <span>迴圈延遲 / FPS</span>
            <Activity className="w-3.5 h-3.5" />
          </div>
          <div className="font-mono text-xl font-semibold tabular-nums text-stone-900 dark:text-stone-100">
            {latest ? `${latest.loopLagMs} ms` : '--'}
          </div>
          <div className="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
            {latest ? `${latest.fps} FPS` : '-- FPS'} · 峰值 {peakLag} ms
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#F7F6F2] dark:bg-[#242422] space-y-1">
          <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400">
            <span>快取命中率</span>
            <Database className="w-3.5 h-3.5" />
          </div>
          <div className="font-mono text-xl font-semibold tabular-nums text-stone-900 dark:text-stone-100">
            {cacheStats.hits + cacheStats.misses > 0 ? `${cacheStats.hitRatePct}%` : '--'}
          </div>
          <div className="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
            命中 {cacheStats.hits} / 未中 {cacheStats.misses}
          </div>
        </div>
      </div>

      {/* Real-time Dual Sparkline (CPU % & Memory MB) */}
      <div className="p-3 rounded-xl bg-[#F7F6F2] dark:bg-[#242422] space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500 dark:text-stone-400">
          <span className="font-medium text-stone-700 dark:text-stone-300">
            即時 CPU 與記憶體時間序列（近 24 秒）
          </span>
          <div className="flex items-center gap-3 tabular-nums">
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-0.5 bg-[#284152] dark:bg-[#E7E5E0] inline-block" />
              <span>CPU %</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-0.5 bg-[#9E3B33] dark:bg-[#E07A70] inline-block" />
              <span>
                {perf.heapSupported ? 'Heap MB' : '快取 MB'} (頂 {chartGeometry.maxMemLabel} MB)
              </span>
            </span>
          </div>
        </div>

        {perf.samples.length < 2 ? (
          <div className="h-[112px] flex items-center justify-center text-xs text-stone-400">
            正在收集效能採樣點...
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${chartGeometry.W} ${chartGeometry.H}`}
            className="w-full h-[112px] overflow-visible"
            role="img"
            aria-label="即時 CPU 與記憶體使用率折線圖"
          >
            {/* Subtle horizontal guides */}
            <line
              x1={0}
              y1={8}
              x2={chartGeometry.W}
              y2={8}
              className="stroke-stone-300/60 dark:stroke-stone-700/60"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <line
              x1={0}
              y1={56}
              x2={chartGeometry.W}
              y2={56}
              className="stroke-stone-300/60 dark:stroke-stone-700/60"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <line
              x1={0}
              y1={104}
              x2={chartGeometry.W}
              y2={104}
              className="stroke-stone-300/80 dark:stroke-stone-700/80"
              strokeWidth="1"
            />

            {/* Export active background window highlight */}
            {chartGeometry.exportBands.map((band, i) => (
              <rect
                key={i}
                x={band.x}
                y={8}
                width={band.w}
                height={96}
                className="fill-[#284152]/10 dark:fill-[#E7E5E0]/10"
              />
            ))}

            {/* CPU area + line */}
            {chartGeometry.cpuAreaPath && (
              <path
                d={chartGeometry.cpuAreaPath}
                className="fill-[#284152]/12 dark:fill-[#E7E5E0]/12"
              />
            )}
            {chartGeometry.cpuPath && (
              <path
                d={chartGeometry.cpuPath}
                fill="none"
                className="stroke-[#284152] dark:stroke-[#E7E5E0]"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {/* Memory line */}
            {chartGeometry.memPath && (
              <path
                d={chartGeometry.memPath}
                fill="none"
                className="stroke-[#9E3B33] dark:stroke-[#E07A70]"
                strokeWidth="1.75"
                strokeDasharray="4 2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
          </svg>
        )}
      </div>

      {/* Export Memory Cache Status & Controls */}
      <div className="pt-3 border-t border-stone-200/80 dark:border-stone-800 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-medium text-stone-800 dark:text-stone-200">
            匯出輕量記憶體快取層
          </span>
          <span className="font-mono text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
            {formatBytes(cacheStats.estimatedBytes)} / {formatBytes(cacheStats.maxBytes)} ({cacheUsagePct}%)
          </span>
        </div>

        <div className="w-full h-1.5 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
          <div
            className="h-full bg-[#284152] dark:bg-[#E7E5E0] transition-all duration-200"
            style={{ width: `${cacheUsagePct}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
          <span>
            已預處理作品 {cacheStats.workEntries} · 影像快取 {cacheStats.imageEntries} · PDF 圖板{' '}
            {cacheStats.pdfImageEntries} · 斷行快取 {cacheStats.wrapEntries}
            {cacheStats.evictions > 0 ? ` · LRU 淘汰 ${cacheStats.evictions}` : ''}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={prewarming}
              onClick={() => void handleManualPrewarm()}
              className="min-h-[34px] px-2.5 rounded-lg border border-stone-200 dark:border-stone-700 text-[11px] font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50 whitespace-nowrap"
            >
              {prewarming ? '預熱中...' : '預熱作品快取'}
            </button>
          </div>
        </div>
      </div>

      {/* Recent Export Task Profiles */}
      <div className="pt-3 border-t border-stone-200/80 dark:border-stone-800 space-y-2">
        <div className="text-xs font-medium text-stone-800 dark:text-stone-200">
          匯出任務效能紀錄（近 {perf.profiles.length} 筆）
        </div>
        {perf.profiles.length === 0 ? (
          <p className="text-[11px] text-stone-400 leading-relaxed">
            尚無匯出剖面紀錄。執行 PDF、ZIP、JSON 匯出或下方「10 秒匯出任務」後，此處將自動記錄耗時、CPU 峰值、事件迴圈延遲與記憶體變化。
          </p>
        ) : (
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {perf.profiles.map((p) => (
              <div
                key={p.id}
                className="p-2.5 rounded-lg bg-[#F7F6F2] dark:bg-[#242422] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[11px]"
              >
                <div className="min-w-0">
                  <div className="font-medium text-stone-800 dark:text-stone-100 truncate">
                    {p.title}
                  </div>
                  <div className="text-stone-500 dark:text-stone-400 tabular-nums">
                    耗時 {(p.durationMs / 1000).toFixed(2)}s · 讓步 {p.yieldCount} 次 · 長任務{' '}
                    {p.longTasks} · 快取命中 {p.cacheHitRatePct}%
                  </div>
                </div>
                <div className="font-mono text-stone-700 dark:text-stone-300 tabular-nums shrink-0 sm:text-right">
                  CPU 均/峰 {p.avgCpuPct}% / {p.peakCpuPct}% · 延遲 {p.peakLagMs}ms
                  {p.peakHeapMB != null
                    ? ` · 峰值 ${p.peakHeapMB}MB${
                        p.heapDeltaMB !== null
                          ? ` (${p.heapDeltaMB >= 0 ? '+' : ''}${p.heapDeltaMB})`
                          : ''
                      }`
                    : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Crash Incident & Safe Mode Diagnostics */}
      <div className="pt-3 border-t border-stone-200/80 dark:border-stone-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>全域異常日誌與安全模式（離線回復）</span>
          </div>
          <span className="text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
            已記錄異常：{incidentCount} 筆
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !safeMode;
              setSafeModeActive(next);
              setSafeMode(next);
              setActionNote(next ? '已手動啟動安全模式（重整後生效）' : '已解除安全模式');
              window.setTimeout(() => setActionNote(''), 3000);
            }}
            className={`min-h-[34px] px-3 rounded-lg text-xs font-medium border transition-colors ${
              safeMode
                ? 'bg-amber-600 text-white border-transparent'
                : 'bg-white dark:bg-[#222220] border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300'
            }`}
          >
            {safeMode ? '目前處於安全模式（點擊解除）' : '手動啟動安全模式'}
          </button>

          <button
            type="button"
            onClick={() => {
              recordCrashIncident(
                new Error('開發者選項手動觸發的模擬異常測試（驗證安全回復流程）'),
                'uncaught_error',
                'DeveloperPerfDashboard.tsx:testSimulation'
              );
              setIncidentCount(getCrashIncidents().length);
              setActionNote('已寫入一筆模擬異常事件（下次冷啟動將提示安全模式）');
              window.setTimeout(() => setActionNote(''), 3500);
            }}
            className="min-h-[34px] px-3 rounded-lg border border-stone-200 dark:border-stone-700 text-xs text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            模擬寫入異常事件
          </button>

          {incidentCount > 0 && (
            <button
              type="button"
              onClick={() => {
                clearCrashIncidents();
                setIncidentCount(0);
                setActionNote('已清空所有本地異常日誌與待處理提示');
                window.setTimeout(() => setActionNote(''), 3000);
              }}
              className="min-h-[34px] px-3 rounded-lg border border-stone-200 dark:border-stone-700 text-xs text-[#9E3B33] dark:text-[#E07A70] hover:bg-[#9E3B33]/10 transition-colors inline-flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>清空異常日誌</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
