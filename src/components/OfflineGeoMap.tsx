import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import * as d3 from 'd3';
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Eye,
  Globe,
  Layers,
  List as ListIcon,
  Map as MapIcon,
  MapPin,
  Maximize2,
  Minus,
  Navigation,
  Plus,
  X,
} from 'lucide-react';
import { useMotionPreferences } from '../contexts/MotionConfigContext';
import { useBackHandler } from '../hooks/useBackHandler';
import { OFFLINE_WORLD_AND_TAIWAN_GEOJSON } from '../data/offlineMapGeo';
import {
  getMacroRegion,
  MACRO_REGIONS,
  MacroRegionKey,
  ResolvedGeoLocation,
  resolveWorkGeoLocation,
} from '../services/offlineGeocoder';
import { Collection, WorkItem } from '../types';
import { SlidingPill } from './SlidingPill';

interface OfflineGeoMapProps {
  works: WorkItem[];
  collections: Collection[];
  onSelectWork: (work: WorkItem) => void;
  onToggleFavorite?: (work: WorkItem, e: React.MouseEvent) => void;
  onReady?: () => void;
}

interface MappedWorkPoint {
  work: WorkItem;
  geo: ResolvedGeoLocation;
  macroRegion: MacroRegionKey;
}

interface MarkerCluster {
  id: string;
  lat: number;
  lng: number;
  placeName: string;
  region: string;
  macroRegion: MacroRegionKey;
  items: MappedWorkPoint[];
}

interface ProjectedWorkPoint {
  point: MappedWorkPoint;
  cx: number;
  cy: number;
}

interface ScreenRenderCluster {
  id: string;
  items: MappedWorkPoint[];
  placeName: string;
  cx: number;
  cy: number;
  sx: number;
  sy: number;
  minCx: number;
  maxCx: number;
  minCy: number;
  maxCy: number;
  isSpreadCluster: boolean;
  baseCluster: MarkerCluster;
}

interface ProjectedRing {
  points: [number, number][];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface CompiledFeature {
  isPrimary: boolean;
  rings: ProjectedRing[];
}

// Sutherland-Hodgman polygon clipping to screen bounds [-pad, w+pad] x [-pad, h+pad]
// Eliminates huge offscreen path tessellation in Skia/Chromium when zoomed deep into small regions.
function clipRingToViewport(
  pts: [number, number][],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): [number, number][] {
  if (pts.length < 3) return [];

  let output = pts;

  // Clip against 4 edges: left, right, top, bottom
  const edges: Array<{
    inside: (p: [number, number]) => boolean;
    intersect: (a: [number, number], b: [number, number]) => [number, number];
  }> = [
    {
      inside: (p) => p[0] >= minX,
      intersect: (a, b) => {
        const dx = b[0] - a[0];
        const t = dx === 0 ? 0 : (minX - a[0]) / dx;
        return [minX, a[1] + t * (b[1] - a[1])];
      },
    },
    {
      inside: (p) => p[0] <= maxX,
      intersect: (a, b) => {
        const dx = b[0] - a[0];
        const t = dx === 0 ? 0 : (maxX - a[0]) / dx;
        return [maxX, a[1] + t * (b[1] - a[1])];
      },
    },
    {
      inside: (p) => p[1] >= minY,
      intersect: (a, b) => {
        const dy = b[1] - a[1];
        const t = dy === 0 ? 0 : (minY - a[1]) / dy;
        return [a[0] + t * (b[0] - a[0]), minY];
      },
    },
    {
      inside: (p) => p[1] <= maxY,
      intersect: (a, b) => {
        const dy = b[1] - a[1];
        const t = dy === 0 ? 0 : (maxY - a[1]) / dy;
        return [a[0] + t * (b[0] - a[0]), maxY];
      },
    },
  ];

  for (let e = 0; e < 4; e++) {
    const edge = edges[e];
    const input = output;
    if (input.length === 0) return [];
    const next: [number, number][] = [];
    let prev = input[input.length - 1];
    let prevInside = edge.inside(prev);

    for (let i = 0; i < input.length; i++) {
      const curr = input[i];
      const currInside = edge.inside(curr);
      if (currInside) {
        if (!prevInside) {
          next.push(edge.intersect(prev, curr));
        }
        next.push(curr);
      } else if (prevInside) {
        next.push(edge.intersect(prev, curr));
      }
      prev = curr;
      prevInside = currInside;
    }
    output = next;
  }

  return output.length >= 3 ? output : [];
}

type GeoViewMode = 'map' | 'list';

const GEO_VIEW_MODE_KEY = 'folio_geo_view_mode';

function loadGeoViewMode(): GeoViewMode {
  try {
    const saved = localStorage.getItem(GEO_VIEW_MODE_KEY);
    if (saved === 'list' || saved === 'map') return saved;
  } catch {
    // Ignore storage access errors
  }
  return 'map';
}

function getThemePalette(isDark: boolean) {
  if (isDark) {
    return {
      ocean: '#151718',
      primaryLand: '#2A2E30',
      primaryStroke: '#64696E',
      contextLand: '#202325',
      contextStroke: '#3E4246',
      graticule: 'rgba(168, 162, 158, 0.18)',
      textColor: '#F5F5F4',
      labelHalo: '#151718',
    };
  }
  return {
    ocean: '#EFECE3',
    primaryLand: '#DFD8C8',
    primaryStroke: '#A79F8E',
    contextLand: '#E7E2D6',
    contextStroke: '#C8C0B0',
    graticule: 'rgba(120, 113, 108, 0.22)',
    textColor: '#1C1917',
    labelHalo: '#FAF8F3',
  };
}

export const OfflineGeoMap: React.FC<OfflineGeoMapProps> = ({
  works,
  collections,
  onSelectWork,
  onReady,
}) => {
  const { animationOverhaul } = useMotionPreferences();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const pendingFlyWorkRef = useRef<MappedWorkPoint | null>(null);
  const drawRafRef = useRef<number | null>(null);
  const readyNotifiedRef = useRef(false);
  const renderedClustersRef = useRef<ScreenRenderCluster[]>([]);

  const [viewMode, setViewMode] = useState<GeoViewMode>(loadGeoViewMode);
  const [activeCluster, setActiveCluster] = useState<MarkerCluster | null>(null);
  const [activeWorkIndex, setActiveWorkIndex] = useState(0);
  const [showDrawer, setShowDrawer] = useState(false);
  useBackHandler(showDrawer, () => setShowDrawer(false));
  const [mapDimensions, setMapDimensions] = useState({ width: 800, height: 520 });
  const [isDarkTheme, setIsDarkTheme] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );

  // Regional list view filter & collapse state
  const [selectedMacroFilter, setSelectedMacroFilter] = useState<MacroRegionKey | 'all'>('all');
  const [collapsedRegions, setCollapsedRegions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      localStorage.setItem(GEO_VIEW_MODE_KEY, viewMode);
    } catch {
      // Ignore storage quota errors
    }
  }, [viewMode]);

  // Observe <html> dark class changes so canvas palette stays synchronized
  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setIsDarkTheme(root.classList.contains('dark'));
    syncTheme();
    const mo = new MutationObserver(syncTheme);
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  const collectionMap = useMemo(
    () => new Map(collections.map((c) => [c.id, c.name])),
    [collections]
  );

  // Extract works with valid offline coordinates
  const mappedWorks = useMemo<MappedWorkPoint[]>(() => {
    const list: MappedWorkPoint[] = [];
    works.forEach((w) => {
      const geo = resolveWorkGeoLocation(w);
      if (geo) {
        list.push({
          work: w,
          geo,
          macroRegion: getMacroRegion(geo),
        });
      }
    });
    return list;
  }, [works]);

  const unmappedCount = works.length - mappedWorks.length;

  // Group nearby works into geographic clusters (~0.04 deg ≈ 4km)
  const clusters = useMemo<MarkerCluster[]>(() => {
    const res: MarkerCluster[] = [];
    const threshold = 0.04;

    mappedWorks.forEach((point) => {
      const existing = res.find(
        (c) =>
          Math.abs(c.lat - point.geo.latitude) < threshold &&
          Math.abs(c.lng - point.geo.longitude) < threshold
      );

      if (existing) {
        existing.items.push(point);
      } else {
        res.push({
          id: `cluster_${point.geo.latitude.toFixed(4)}_${point.geo.longitude.toFixed(4)}`,
          lat: point.geo.latitude,
          lng: point.geo.longitude,
          placeName: point.geo.placeName,
          region: point.geo.region,
          macroRegion: point.macroRegion,
          items: [point],
        });
      }
    });

    return res;
  }, [mappedWorks]);

  // Regional list grouping: MacroRegion -> PlaceName -> MappedWorkPoint[]
  const regionalGroups = useMemo(() => {
    return MACRO_REGIONS.map((meta) => {
      const pointsInRegion = mappedWorks.filter((p) => p.macroRegion === meta.key);
      const placeMap = new Map<string, MappedWorkPoint[]>();
      pointsInRegion.forEach((pt) => {
        const key = pt.geo.placeName || pt.geo.region;
        const arr = placeMap.get(key) || [];
        arr.push(pt);
        placeMap.set(key, arr);
      });
      const places = Array.from(placeMap.entries()).map(([placeName, items]) => ({
        placeName,
        items,
        lat: items[0].geo.latitude,
        lng: items[0].geo.longitude,
      }));
      return {
        meta,
        totalWorks: pointsInRegion.length,
        places,
      };
    }).filter((g) => g.totalWorks > 0);
  }, [mappedWorks]);

  const visibleRegionalGroups = useMemo(() => {
    if (selectedMacroFilter === 'all') return regionalGroups;
    return regionalGroups.filter((g) => g.meta.key === selectedMacroFilter);
  }, [regionalGroups, selectedMacroFilter]);

  // Measure map container dimensions
  useEffect(() => {
    if (viewMode !== 'map') {
      if (!readyNotifiedRef.current) {
        readyNotifiedRef.current = true;
        onReady?.();
      }
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    const updateSize = (w: number, h: number) => {
      const nextW = Math.max(280, Math.floor(w));
      const nextH = Math.max(420, Math.floor(h));
      setMapDimensions((prev) => {
        if (Math.abs(prev.width - nextW) <= 4 && Math.abs(prev.height - nextH) <= 4) {
          return prev;
        }
        return { width: nextW, height: nextH };
      });
    };

    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      updateSize(rect.width, rect.height);
    }

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          updateSize(width, height);
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [viewMode, onReady]);

  // Base D3 Projection centered on Taiwan
  const baseScale = useMemo(
    () => Math.min(mapDimensions.width, mapDimensions.height) * 6.5,
    [mapDimensions]
  );

  const projection = useMemo(() => {
    const { width, height } = mapDimensions;
    return d3
      .geoMercator()
      .center([121.0, 23.7])
      .scale(baseScale)
      .translate([width / 2, height / 2]);
  }, [mapDimensions, baseScale]);

  // Pre-project polygon rings, bounding boxes, and Mercator grid axes once per resize
  // so every zoom frame renders strictly inside screen space with zero Path2D re-tessellation.
  const compiledGeometry = useMemo(() => {
    const meridianXs: number[] = [];
    for (let lng = -180; lng <= 180; lng += 10) {
      const pt = projection([lng, 0]);
      if (pt) meridianXs.push(pt[0]);
    }

    const parallelYs: number[] = [];
    for (let lat = -80; lat <= 80; lat += 10) {
      const pt = projection([121.0, lat]);
      if (pt) parallelYs.push(pt[1]);
    }

    const projectRing = (ringCoords: number[][]): ProjectedRing | null => {
      const pts: [number, number][] = [];
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      // Drop closing duplicate point if identical to first point (clipper wraps cleanly)
      const count = ringCoords.length;
      const limit =
        count > 1 &&
        ringCoords[0][0] === ringCoords[count - 1][0] &&
        ringCoords[0][1] === ringCoords[count - 1][1]
          ? count - 1
          : count;

      for (let i = 0; i < limit; i++) {
        const projected = projection([ringCoords[i][0], ringCoords[i][1]]);
        if (!projected) continue;
        const x = projected[0];
        const y = projected[1];
        pts.push([x, y]);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }

      if (pts.length < 3) return null;
      return { points: pts, minX, maxX, minY, maxY };
    };

    const features: CompiledFeature[] = OFFLINE_WORLD_AND_TAIWAN_GEOJSON.features.map((f) => {
      const rings: ProjectedRing[] = [];
      if (f.geometry.type === 'Polygon') {
        const poly = f.geometry.coordinates as number[][][];
        if (poly[0]) {
          const r = projectRing(poly[0]);
          if (r) rings.push(r);
        }
      } else {
        const multi = f.geometry.coordinates as number[][][][];
        for (let m = 0; m < multi.length; m++) {
          if (multi[m][0]) {
            const r = projectRing(multi[m][0]);
            if (r) rings.push(r);
          }
        }
      }
      return {
        isPrimary: Boolean(f.properties.isPrimary),
        rings,
      };
    });

    return { meridianXs, parallelYs, features };
  }, [projection]);

  const baseClusterByWorkId = useMemo(() => {
    const map = new Map<string, MarkerCluster>();
    clusters.forEach((c) => {
      c.items.forEach((item) => {
        map.set(item.work.id, c);
      });
    });
    return map;
  }, [clusters]);

  const projectedPoints = useMemo<ProjectedWorkPoint[]>(() => {
    const res: ProjectedWorkPoint[] = [];
    mappedWorks.forEach((point) => {
      const coords = projection([point.geo.longitude, point.geo.latitude]);
      if (coords) {
        res.push({ point, cx: coords[0], cy: coords[1] });
      }
    });
    return res;
  }, [mappedWorks, projection]);

  // Keep latest render parameters in refs so zoom frames run synchronously with zero overhead
  const renderParamsRef = useRef({
    compiledGeometry,
    projectedPoints,
    baseClusterByWorkId,
    mapDimensions,
    isDarkTheme,
    activeClusterId: activeCluster?.id || null,
  });

  renderParamsRef.current = {
    compiledGeometry,
    projectedPoints,
    baseClusterByWorkId,
    mapDimensions,
    isDarkTheme,
    activeClusterId: activeCluster?.id || null,
  };

  const drawCanvasNow = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const {
      compiledGeometry: geom,
      projectedPoints: points,
      baseClusterByWorkId: clusterLookup,
      mapDimensions: dims,
      isDarkTheme: dark,
      activeClusterId,
    } = renderParamsRef.current;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.floor(dims.width * dpr);
    const targetH = Math.floor(dims.height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const t = transformRef.current;
    const palette = getThemePalette(dark);

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Ocean background
    ctx.fillStyle = palette.ocean;
    ctx.fillRect(0, 0, dims.width, dims.height);

    // 2. Draw visible Mercator graticule lines directly in screen space
    // (Prevents Skia CPU dash-tessellation lag when deeply zoomed into small areas)
    ctx.strokeStyle = palette.graticule;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    for (let i = 0; i < geom.meridianXs.length; i++) {
      const sx = geom.meridianXs[i] * t.k + t.x;
      if (sx >= -2 && sx <= dims.width + 2) {
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, dims.height);
      }
    }
    for (let i = 0; i < geom.parallelYs.length; i++) {
      const sy = geom.parallelYs[i] * t.k + t.y;
      if (sy >= -2 && sy <= dims.height + 2) {
        ctx.moveTo(0, sy);
        ctx.lineTo(dims.width, sy);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Draw viewport-clipped landmasses in crisp 1:1 screen coordinates
    const clipPad = 8;
    const clipMinX = -clipPad;
    const clipMaxX = dims.width + clipPad;
    const clipMinY = -clipPad;
    const clipMaxY = dims.height + clipPad;

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let fIdx = 0; fIdx < geom.features.length; fIdx++) {
      const feat = geom.features[fIdx];
      ctx.fillStyle = feat.isPrimary ? palette.primaryLand : palette.contextLand;
      ctx.strokeStyle = feat.isPrimary ? palette.primaryStroke : palette.contextStroke;
      ctx.lineWidth = feat.isPrimary ? 1.4 : 0.9;

      for (let rIdx = 0; rIdx < feat.rings.length; rIdx++) {
        const ring = feat.rings[rIdx];
        const sMinX = ring.minX * t.k + t.x;
        const sMaxX = ring.maxX * t.k + t.x;
        const sMinY = ring.minY * t.k + t.y;
        const sMaxY = ring.maxY * t.k + t.y;

        // O(1) offscreen rejection
        if (sMaxX < clipMinX || sMinX > clipMaxX || sMaxY < clipMinY || sMinY > clipMaxY) {
          continue;
        }

        const rawPts = ring.points;
        const screenPts: [number, number][] = new Array(rawPts.length);
        for (let p = 0; p < rawPts.length; p++) {
          screenPts[p] = [rawPts[p][0] * t.k + t.x, rawPts[p][1] * t.k + t.y];
        }

        const fullyInside =
          sMinX >= clipMinX && sMaxX <= clipMaxX && sMinY >= clipMinY && sMaxY <= clipMaxY;
        const drawPts = fullyInside
          ? screenPts
          : clipRingToViewport(screenPts, clipMinX, clipMaxX, clipMinY, clipMaxY);

        if (drawPts.length < 3) continue;

        ctx.beginPath();
        ctx.moveTo(drawPts[0][0], drawPts[0][1]);
        for (let p = 1; p < drawPts.length; p++) {
          ctx.lineTo(drawPts[p][0], drawPts[p][1]);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // 3. Zoom-dependent dynamic screen-space clustering (runs in <0.1ms per frame)
    const mergeRadiusPx = t.k < 1.2 ? 56 : t.k < 3.5 ? 42 : t.k < 8 ? 28 : 16;
    const screenClusters: ScreenRenderCluster[] = [];

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const sx = pt.cx * t.k + t.x;
      const sy = pt.cy * t.k + t.y;

      let matched: ScreenRenderCluster | null = null;
      let bestDist = mergeRadiusPx;

      for (let j = 0; j < screenClusters.length; j++) {
        const sc = screenClusters[j];
        const dist = Math.hypot(sx - sc.sx, sy - sc.sy);
        if (dist <= bestDist) {
          bestDist = dist;
          matched = sc;
        }
      }

      if (matched) {
        const n = matched.items.length;
        matched.items.push(pt.point);
        matched.cx = (matched.cx * n + pt.cx) / (n + 1);
        matched.cy = (matched.cy * n + pt.cy) / (n + 1);
        matched.sx = matched.cx * t.k + t.x;
        matched.sy = matched.cy * t.k + t.y;
        if (pt.cx < matched.minCx) matched.minCx = pt.cx;
        if (pt.cx > matched.maxCx) matched.maxCx = pt.cx;
        if (pt.cy < matched.minCy) matched.minCy = pt.cy;
        if (pt.cy > matched.maxCy) matched.maxCy = pt.cy;
      } else {
        const fallbackBase: MarkerCluster = clusterLookup.get(pt.point.work.id) || {
          id: `dyn_${pt.point.work.id}`,
          lat: pt.point.geo.latitude,
          lng: pt.point.geo.longitude,
          placeName: pt.point.geo.placeName,
          region: pt.point.geo.region,
          macroRegion: pt.point.macroRegion,
          items: [pt.point],
        };
        screenClusters.push({
          id: fallbackBase.id,
          items: [pt.point],
          placeName: pt.point.geo.placeName,
          cx: pt.cx,
          cy: pt.cy,
          sx,
          sy,
          minCx: pt.cx,
          maxCx: pt.cx,
          minCy: pt.cy,
          maxCy: pt.cy,
          isSpreadCluster: false,
          baseCluster: fallbackBase,
        });
      }
    }

    for (let i = 0; i < screenClusters.length; i++) {
      const sc = screenClusters[i];
      const spreadX = sc.maxCx - sc.minCx;
      const spreadY = sc.maxCy - sc.minCy;
      sc.isSpreadCluster = sc.items.length > 1 && (spreadX > 1.2 || spreadY > 1.2);

      if (sc.isSpreadCluster) {
        const distinctPlaces = new Set(sc.items.map((item) => item.geo.placeName)).size;
        const firstRegion = sc.items[0].geo.region;
        const allSameRegion = sc.items.every((item) => item.geo.region === firstRegion);
        const shortPlace = sc.items[0].geo.placeName.split('·')[0].trim();
        sc.placeName = allSameRegion
          ? `${shortPlace}等 ${distinctPlaces} 處`
          : `${firstRegion}等 ${distinctPlaces} 地`;
      } else {
        sc.placeName = sc.baseCluster.placeName || sc.items[0].geo.placeName;
      }
    }

    renderedClustersRef.current = screenClusters;

    // 4. Draw aggregated clusters & single markers in crisp 1:1 screen coordinates
    for (let i = 0; i < screenClusters.length; i++) {
      const sc = screenClusters[i];
      const sx = sc.sx;
      const sy = sc.sy;
      if (sx < -72 || sx > dims.width + 72 || sy < -72 || sy > dims.height + 72) continue;

      const isSelected = !sc.isSpreadCluster && activeClusterId === sc.baseCluster.id;
      const isAggregated = sc.isSpreadCluster;
      const baseRadius = isAggregated
        ? sc.items.length >= 10
          ? 16
          : 14
        : isSelected
        ? 12
        : 10.5;

      // Soft outer halo
      ctx.beginPath();
      ctx.arc(sx, sy, isAggregated ? baseRadius + 7 : isSelected ? 20 : 16, 0, Math.PI * 2);
      ctx.fillStyle = isAggregated
        ? 'rgba(158, 59, 51, 0.20)'
        : isSelected
        ? 'rgba(158, 59, 51, 0.25)'
        : 'rgba(40, 65, 82, 0.14)';
      ctx.fill();

      // Pin / Cluster body
      ctx.beginPath();
      ctx.arc(sx, sy, baseRadius, 0, Math.PI * 2);
      ctx.fillStyle = isAggregated ? '#9E3B33' : isSelected ? '#9E3B33' : '#284152';
      ctx.fill();
      ctx.lineWidth = isAggregated ? 2.4 : 2;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();

      // Count or inner dot
      if (sc.items.length > 1) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `700 ${isAggregated ? 11.5 : 10}px "Plus Jakarta Sans", "Noto Sans TC", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(sc.items.length), sx, sy + 0.5);
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = '#FAF9F5';
        ctx.fill();
      }

      // Label with crisp halo
      ctx.font = '600 11px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = palette.labelHalo;
      const labelY = sy + baseRadius + 4;
      ctx.strokeText(sc.placeName, sx, labelY);
      ctx.fillStyle = palette.textColor;
      ctx.fillText(sc.placeName, sx, labelY);
    }

    ctx.restore();
  }, []);

  const scheduleDraw = useCallback(() => {
    if (drawRafRef.current !== null) return;
    drawRafRef.current = window.requestAnimationFrame(() => {
      drawRafRef.current = null;
      drawCanvasNow();
    });
  }, [drawCanvasNow]);

  // Attach D3 zoom to canvas element (60fps GPU-fast pinch/drag/button zoom)
  useEffect(() => {
    if (viewMode !== 'map') return;
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.02, 24])
      .clickDistance(6)
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        scheduleDraw();
      });

    zoomBehaviorRef.current = zoom;
    const selection = d3.select(canvasEl);
    selection.call(zoom);
    // Sync current transform without resetting user's viewport on dimension updates
    selection.call(zoom.transform, transformRef.current);

    return () => {
      selection.interrupt();
      selection.on('.zoom', null);
    };
  }, [viewMode, scheduleDraw]);

  // Redraw when geometry, theme, selection, or markers update, and notify parent readiness
  useEffect(() => {
    if (viewMode !== 'map') return;

    const rafId = window.requestAnimationFrame(() => {
      drawCanvasNow();

      // Handle pending fly-to work from Regional List view
      const pending = pendingFlyWorkRef.current;
      if (pending && canvasRef.current && zoomBehaviorRef.current) {
        pendingFlyWorkRef.current = null;
        const targetCluster = clusters.find((c) =>
          c.items.some((item) => item.work.id === pending.work.id)
        );
        const coords = projection([pending.geo.longitude, pending.geo.latitude]);
        if (targetCluster && coords) {
          setActiveCluster(targetCluster);
          const idx = targetCluster.items.findIndex((i) => i.work.id === pending.work.id);
          setActiveWorkIndex(idx >= 0 ? idx : 0);
          d3.select(canvasRef.current).call(
            zoomBehaviorRef.current.transform,
            d3.zoomIdentity
              .translate(mapDimensions.width / 2, mapDimensions.height / 2)
              .scale(4)
              .translate(-coords[0], -coords[1])
          );
        }
      }

      if (!readyNotifiedRef.current) {
        readyNotifiedRef.current = true;
        onReady?.();
      }
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [
    viewMode,
    compiledGeometry,
    projectedPoints,
    isDarkTheme,
    activeCluster?.id,
    drawCanvasNow,
    clusters,
    projection,
    mapDimensions,
    onReady,
  ]);

  useEffect(() => {
    return () => {
      if (drawRafRef.current !== null) {
        window.cancelAnimationFrame(drawRafRef.current);
      }
    };
  }, []);

  // Canvas tap / click hit-testing for clusters & markers
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const t = transformRef.current;

    let hit: ScreenRenderCluster | null = null;
    let bestDist = 30; // generous 60px hit diameter for touch ergonomics

    for (const sc of renderedClustersRef.current) {
      const dist = Math.hypot(px - sc.sx, py - sc.sy);
      if (dist <= bestDist) {
        bestDist = dist;
        hit = sc;
      }
    }

    if (hit) {
      if (hit.isSpreadCluster) {
        // Auto zoom into the clicked geographic cluster area
        setActiveCluster(null);
        if (zoomBehaviorRef.current) {
          const dx = Math.max(4, hit.maxCx - hit.minCx);
          const dy = Math.max(4, hit.maxCy - hit.minCy);
          const midCx = (hit.minCx + hit.maxCx) / 2;
          const midCy = (hit.minCy + hit.maxCy) / 2;
          const fitScale = Math.min(
            (mapDimensions.width * 0.52) / dx,
            (mapDimensions.height * 0.52) / dy
          );
          const nextScale = Math.min(18, Math.max(t.k * 2.4, Math.min(fitScale, t.k * 6)));

          d3.select(canvas)
            .transition()
            .duration(280)
            .ease(d3.easeCubicOut)
            .call(
              zoomBehaviorRef.current.transform,
              d3.zoomIdentity
                .translate(mapDimensions.width / 2, mapDimensions.height / 2)
                .scale(nextScale)
                .translate(-midCx, -midCy)
            );
        }
      } else {
        setActiveCluster(hit.baseCluster);
        setActiveWorkIndex(0);
        if (zoomBehaviorRef.current) {
          const targetScale = Math.max(2.5, Math.min(5, t.k < 2 ? 3.5 : t.k));
          d3.select(canvas)
            .transition()
            .duration(260)
            .ease(d3.easeCubicOut)
            .call(
              zoomBehaviorRef.current.transform,
              d3.zoomIdentity
                .translate(mapDimensions.width / 2, mapDimensions.height / 2)
                .scale(targetScale)
                .translate(-hit.cx, -hit.cy)
            );
        }
      }
    } else {
      setActiveCluster(null);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    let overMarker = false;
    for (const sc of renderedClustersRef.current) {
      if (Math.hypot(px - sc.sx, py - sc.sy) <= 24) {
        overMarker = true;
        break;
      }
    }
    canvas.style.cursor = overMarker ? 'pointer' : 'grab';
  };

  // Smooth Zoom control helpers
  const handleZoomIn = () => {
    if (canvasRef.current && zoomBehaviorRef.current) {
      d3.select(canvasRef.current)
        .transition()
        .duration(180)
        .ease(d3.easeCubicOut)
        .call(zoomBehaviorRef.current.scaleBy, 1.55);
    }
  };

  const handleZoomOut = () => {
    if (canvasRef.current && zoomBehaviorRef.current) {
      d3.select(canvasRef.current)
        .transition()
        .duration(180)
        .ease(d3.easeCubicOut)
        .call(zoomBehaviorRef.current.scaleBy, 0.65);
    }
  };

  const handleResetTaiwan = useCallback(() => {
    if (canvasRef.current && zoomBehaviorRef.current) {
      d3.select(canvasRef.current)
        .transition()
        .duration(280)
        .ease(d3.easeCubicOut)
        .call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
    }
    setActiveCluster(null);
  }, []);

  const handleResetGlobal = useCallback(() => {
    if (!canvasRef.current || !zoomBehaviorRef.current) return;
    const { width, height } = mapDimensions;
    const worldScale = Math.max(0.025, (width * 0.9) / (2 * Math.PI * baseScale));
    const worldCenter = projection([15, 22]) || [width / 2, height / 2];

    d3.select(canvasRef.current)
      .transition()
      .duration(320)
      .ease(d3.easeCubicOut)
      .call(
        zoomBehaviorRef.current.transform,
        d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(worldScale)
          .translate(-worldCenter[0], -worldCenter[1])
      );
    setActiveCluster(null);
  }, [mapDimensions, baseScale, projection]);

  const handleFitAllWorks = useCallback(() => {
    if (mappedWorks.length === 0 || !canvasRef.current || !zoomBehaviorRef.current) return;

    if (mappedWorks.length === 1) {
      const pt = mappedWorks[0];
      const coords = projection([pt.geo.longitude, pt.geo.latitude]);
      if (coords) {
        d3.select(canvasRef.current)
          .transition()
          .duration(280)
          .ease(d3.easeCubicOut)
          .call(
            zoomBehaviorRef.current.transform,
            d3.zoomIdentity
              .translate(mapDimensions.width / 2, mapDimensions.height / 2)
              .scale(3.5)
              .translate(-coords[0], -coords[1])
          );
      }
      return;
    }

    const projectedPts = mappedWorks
      .map((p) => projection([p.geo.longitude, p.geo.latitude]))
      .filter((pt): pt is [number, number] => Boolean(pt));
    if (projectedPts.length === 0) return;

    const xs = projectedPts.map((p) => p[0]);
    const ys = projectedPts.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const dx = Math.max(40, maxX - minX);
    const dy = Math.max(40, maxY - minY);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const scale = Math.max(
      0.04,
      Math.min(5, 0.72 / Math.max(dx / mapDimensions.width, dy / mapDimensions.height))
    );

    d3.select(canvasRef.current)
      .transition()
      .duration(300)
      .ease(d3.easeCubicOut)
      .call(
        zoomBehaviorRef.current.transform,
        d3.zoomIdentity
          .translate(mapDimensions.width / 2, mapDimensions.height / 2)
          .scale(scale)
          .translate(-midX, -midY)
      );
  }, [mappedWorks, projection, mapDimensions]);

  const handleFlyToWork = (point: MappedWorkPoint) => {
    if (viewMode !== 'map') {
      pendingFlyWorkRef.current = point;
      setViewMode('map');
      return;
    }

    const targetCluster = clusters.find((c) =>
      c.items.some((item) => item.work.id === point.work.id)
    );
    if (!targetCluster) return;

    setActiveCluster(targetCluster);
    const idx = targetCluster.items.findIndex((item) => item.work.id === point.work.id);
    setActiveWorkIndex(idx >= 0 ? idx : 0);
    setShowDrawer(false);

    const coords = projection([point.geo.longitude, point.geo.latitude]);
    if (coords && canvasRef.current && zoomBehaviorRef.current) {
      d3.select(canvasRef.current)
        .transition()
        .duration(300)
        .ease(d3.easeCubicOut)
        .call(
          zoomBehaviorRef.current.transform,
          d3.zoomIdentity
            .translate(mapDimensions.width / 2, mapDimensions.height / 2)
            .scale(4)
            .translate(-coords[0], -coords[1])
        );
    }
  };

  const toggleRegionCollapse = (key: string) => {
    setCollapsedRegions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const activeWorkItem = activeCluster?.items[activeWorkIndex]?.work || null;

  return (
    <div className="space-y-3">
      {/* Top Geo Header Bar: High contrast + Dual-mode Switcher (Map vs Regional List) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-4 py-3 rounded-2xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#EFECE6] dark:bg-[#242422] text-[#284152] dark:text-[#E7E5E0] flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="font-editorial text-sm sm:text-base font-semibold text-stone-900 dark:text-stone-100 truncate">
              拾光地理足跡 · 離線座標圖誌
            </div>
            <div className="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums truncate">
              已標記 {mappedWorks.length} 件作品 · {clusters.length} 處地點
              {unmappedCount > 0 ? ` · ${unmappedCount} 件未設地點` : ''}
            </div>
          </div>
        </div>

        {/* Mode Switcher: Interactive Map vs Lightweight Regional Grouped List */}
        <div
          role="tablist"
          aria-label="地理檢視模式切換"
          className="grid grid-cols-2 sm:inline-flex gap-1 p-1 rounded-xl bg-[#EFECE6] dark:bg-[#242422] shrink-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'map'}
            onClick={() => setViewMode('map')}
            className={`relative min-h-[36px] px-3 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              viewMode === 'map'
                ? 'text-stone-900 dark:text-stone-100'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            {viewMode === 'map' && (
              <SlidingPill
                layoutId="geomap-mode-pill"
                className="bg-white dark:bg-[#141413] shadow-sm rounded-lg"
              />
            )}
            <MapIcon className="w-3.5 h-3.5 shrink-0 relative z-10" />
            <span className="relative z-10">互動地圖</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'list'}
            onClick={() => setViewMode('list')}
            className={`relative min-h-[36px] px-3 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              viewMode === 'list'
                ? 'text-stone-900 dark:text-stone-100'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            {viewMode === 'list' && (
              <SlidingPill
                layoutId="geomap-mode-pill"
                className="bg-white dark:bg-[#141413] shadow-sm rounded-lg"
              />
            )}
            <ListIcon className="w-3.5 h-3.5 shrink-0 relative z-10" />
            <span className="relative z-10">區域列表</span>
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
      {/* MODE 1: HIGH-FPS CANVAS INTERACTIVE OFFLINE MAP */}
      {viewMode === 'map' && (
        <motion.div
          key="geomap-view-map"
          initial={animationOverhaul ? { opacity: 0, y: 10 } : false}
          animate={{ opacity: 1, y: 0 }}
          exit={animationOverhaul ? { opacity: 0, y: -6 } : { opacity: 0 }}
          transition={{ duration: animationOverhaul ? 0.24 : 0.1, ease: [0.25, 0.9, 0.35, 1] }}
          ref={containerRef}
          data-no-swipe="true"
          className="relative w-full rounded-2xl overflow-hidden border border-stone-200/80 dark:border-stone-800 shadow-sm select-none"
          style={{
            backgroundColor: isDarkTheme ? '#151718' : '#EFECE3',
            height: 'clamp(420px, 60vh, 680px)',
          }}
        >
          {/* Hardware-accelerated 2D Canvas for 60fps pinch-zoom & pan */}
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
            className="block w-full h-full cursor-grab active:cursor-grabbing touch-none"
          />

          {/* Top-Right Compact Zoom Controls (+ / - / Fit) */}
          <div className="absolute top-3.5 right-3.5 z-10">
            <div className="bg-white/92 dark:bg-[#1E1E1C]/92 backdrop-blur-md border border-stone-200 dark:border-stone-800 rounded-xl shadow-md p-1 flex flex-col gap-1">
              <button
                type="button"
                onClick={handleZoomIn}
                title="放大地圖"
                aria-label="放大"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                title="縮小地圖"
                aria-label="縮小"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <div className="w-full h-px bg-stone-200 dark:bg-stone-800 my-0.5" />
              <button
                type="button"
                onClick={handleFitAllWorks}
                title="自動符合所有作品"
                aria-label="符合所有足跡"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Bottom-Left: Footprint Drawer Trigger */}
          <div className="absolute bottom-3.5 left-3.5 z-10">
            <button
              type="button"
              onClick={() => setShowDrawer((v) => !v)}
              className="min-h-[40px] px-3 rounded-xl bg-white/94 dark:bg-[#1C1C1A]/94 backdrop-blur-md border border-stone-200 dark:border-stone-800 text-xs font-medium text-stone-800 dark:text-stone-200 shadow-md inline-flex items-center gap-1.5 hover:bg-white dark:hover:bg-stone-800 transition-colors whitespace-nowrap"
            >
              <Layers className="w-4 h-4 text-[#284152] dark:text-[#E7E5E0] shrink-0" />
              <span className="tabular-nums">足跡清單 ({mappedWorks.length})</span>
            </button>
          </div>

          {/* Bottom-Right: Taiwan View / World View Switcher (Unobtrusive corner placement) */}
          <div className="absolute bottom-3.5 right-3.5 z-10">
            <div className="flex items-center gap-1 bg-white/94 dark:bg-[#1E1E1C]/94 backdrop-blur-md border border-stone-200 dark:border-stone-800 rounded-xl shadow-md p-1">
              <button
                type="button"
                onClick={handleResetTaiwan}
                className="min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 whitespace-nowrap shrink-0 transition-colors"
              >
                台灣視角
              </button>
              <button
                type="button"
                onClick={handleResetGlobal}
                className="min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 whitespace-nowrap shrink-0 transition-colors inline-flex items-center gap-1"
              >
                <Globe className="w-3 h-3 shrink-0" />
                <span>世界視角</span>
              </button>
            </div>
          </div>

          {/* Floating Work Preview Card when Marker is Selected */}
          {activeCluster && activeWorkItem && (
            <div className="absolute bottom-3.5 right-3.5 left-3.5 sm:left-auto sm:w-[360px] z-20 pointer-events-auto">
              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E1E1C] border border-stone-200 dark:border-stone-800 shadow-xl space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] text-[#9E3B33] dark:text-[#E07A70] font-medium">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{activeCluster.placeName}</span>
                    </div>
                    <h4 className="font-editorial text-base font-semibold text-stone-900 dark:text-stone-100 truncate mt-0.5">
                      {activeWorkItem.title}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveCluster(null)}
                    aria-label="關閉預覽"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {activeWorkItem.imageData && (
                  <div className="relative rounded-xl overflow-hidden bg-stone-100 dark:bg-stone-900 aspect-video border border-stone-100 dark:border-stone-800">
                    <img
                      src={activeWorkItem.imageData}
                      alt={activeWorkItem.title}
                      className="w-full h-full object-cover"
                    />
                    {activeWorkItem.photoMeta?.camera && (
                      <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/65 text-[10px] text-white">
                        {activeWorkItem.photoMeta.camera}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-1 text-xs text-stone-600 dark:text-stone-300">
                  <div className="flex items-center justify-between text-[11px] text-stone-400">
                    <span>{collectionMap.get(activeWorkItem.collectionId) || '未分類'}</span>
                    <span className="tabular-nums">{activeWorkItem.createdAt}</span>
                  </div>
                  {activeWorkItem.content && (
                    <p className="line-clamp-2 text-stone-500 dark:text-stone-400 text-[11px] leading-relaxed">
                      {activeWorkItem.content}
                    </p>
                  )}
                </div>

                {activeCluster.items.length > 1 && (
                  <div className="flex items-center justify-between pt-1.5 border-t border-stone-100 dark:border-stone-800 text-xs">
                    <span className="text-[11px] text-stone-400 tabular-nums">
                      此地點共 {activeCluster.items.length} 件作品（{activeWorkIndex + 1}/
                      {activeCluster.items.length}）
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={activeWorkIndex <= 0}
                        onClick={() => setActiveWorkIndex((i) => Math.max(0, i - 1))}
                        className="p-1.5 rounded-md text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={activeWorkIndex >= activeCluster.items.length - 1}
                        onClick={() =>
                          setActiveWorkIndex((i) =>
                            Math.min(activeCluster.items.length - 1, i + 1)
                          )
                        }
                        className="p-1.5 rounded-md text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => onSelectWork(activeWorkItem)}
                    className="w-full min-h-[40px] px-3.5 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium inline-flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>閱讀此作品</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Drawer: Plotted Works List */}
          {showDrawer && (
            <div className="absolute inset-y-0 left-0 w-full sm:w-80 bg-white/96 dark:bg-[#1A1A18]/96 backdrop-blur-md border-r border-stone-200 dark:border-stone-800 z-20 shadow-2xl flex flex-col">
              <div className="p-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
                <div>
                  <h3 className="font-editorial text-sm font-semibold text-stone-900 dark:text-stone-100">
                    攝影地理軌跡清單
                  </h3>
                  <p className="text-[11px] text-stone-400 tabular-nums">
                    點擊任一作品自動定位至地圖標記
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDrawer(false)}
                  aria-label="關閉足跡清單"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {mappedWorks.length === 0 ? (
                  <div className="py-8 text-center text-xs text-stone-400">
                    目前沒有具備地點標記的作品
                  </div>
                ) : (
                  mappedWorks.map(({ work, geo, macroRegion }) => (
                    <button
                      key={work.id}
                      type="button"
                      onClick={() => handleFlyToWork({ work, geo, macroRegion })}
                      className="w-full p-2.5 rounded-xl border border-stone-200/80 dark:border-stone-800 hover:border-[#284152] dark:hover:border-stone-600 bg-white dark:bg-[#1E1E1C] text-left transition-all flex items-center gap-3"
                    >
                      {work.imageData ? (
                        <img
                          src={work.imageData}
                          alt={work.title}
                          className="w-12 h-12 rounded-lg object-cover shrink-0 border border-stone-100 dark:border-stone-800"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-400 shrink-0">
                          <Camera className="w-5 h-5" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 text-[10px] text-[#9E3B33] dark:text-[#E07A70] font-medium truncate">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{geo.placeName}</span>
                        </div>
                        <div className="text-xs font-medium text-stone-900 dark:text-stone-100 truncate mt-0.5">
                          {work.title}
                        </div>
                        <div className="text-[10px] text-stone-400 tabular-nums truncate">
                          {work.createdAt} · {collectionMap.get(work.collectionId) || '未分類'}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Empty State Banner when no works have coordinates */}
          {mappedWorks.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center p-6 bg-[#EFECE3]/90 dark:bg-[#151718]/90 backdrop-blur-sm z-10 text-center">
              <div className="max-w-sm space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-[#284152]/10 dark:bg-stone-800 text-[#284152] dark:text-stone-200 flex items-center justify-center">
                  <MapPin className="w-6 h-6" />
                </div>
                <h3 className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100">
                  尚無地理足跡標記
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                  在作品編輯視窗的相機資訊中填寫拍攝地點（如：台北、花蓮、七星潭、台南中西區或經緯度座標），地圖便會自動在此標繪出攝影足跡。
                </p>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* MODE 2: LIGHTWEIGHT REGIONAL GROUPED LIST VIEW */}
      {viewMode === 'list' && (
        <motion.div
          key="geomap-view-list"
          initial={animationOverhaul ? { opacity: 0, y: 10 } : false}
          animate={{ opacity: 1, y: 0 }}
          exit={animationOverhaul ? { opacity: 0, y: -6 } : { opacity: 0 }}
          transition={{ duration: animationOverhaul ? 0.24 : 0.1, ease: [0.25, 0.9, 0.35, 1] }}
          className="space-y-4"
        >
          {mappedWorks.length === 0 ? (
            <div className="py-16 px-6 rounded-2xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-[#EFECE6] dark:bg-stone-800 text-[#284152] dark:text-stone-200 flex items-center justify-center mb-3">
                <MapPin className="w-6 h-6" />
              </div>
              <h3 className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100">
                尚無地理足跡標記
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed max-w-sm mx-auto mt-1.5">
                在作品編輯視窗的相機資訊中填寫拍攝地點（如：台北、花蓮、七星潭、台南中西區或座標），即可依大區域自動整理呈現。
              </p>
            </div>
          ) : (
            <>
              {/* Macro-Region Quick Filter Bar */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedMacroFilter('all')}
                  className={`min-h-[36px] px-3 rounded-xl text-xs font-medium border whitespace-nowrap shrink-0 transition-colors tabular-nums ${
                    selectedMacroFilter === 'all'
                      ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900'
                      : 'border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#191918] text-stone-600 dark:text-stone-300'
                  }`}
                >
                  全部區域 ({mappedWorks.length})
                </button>
                {regionalGroups.map(({ meta, totalWorks }) => (
                  <button
                    key={meta.key}
                    type="button"
                    onClick={() => setSelectedMacroFilter(meta.key)}
                    className={`min-h-[36px] px-3 rounded-xl text-xs font-medium border whitespace-nowrap shrink-0 transition-colors tabular-nums ${
                      selectedMacroFilter === meta.key
                        ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900'
                        : 'border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#191918] text-stone-600 dark:text-stone-300'
                    }`}
                  >
                    {meta.label} ({totalWorks})
                  </button>
                ))}
              </div>

              {/* Grouped Regional Sections */}
              <div className="space-y-4">
                {visibleRegionalGroups.map(({ meta, totalWorks, places }) => {
                  const isCollapsed = Boolean(collapsedRegions[meta.key]);
                  return (
                    <section
                      key={meta.key}
                      className="rounded-2xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 overflow-hidden"
                    >
                      {/* Macro-Region Header */}
                      <button
                        type="button"
                        onClick={() => toggleRegionCollapse(meta.key)}
                        className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-stone-50/70 dark:hover:bg-stone-800/30 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-editorial text-base sm:text-lg font-semibold text-stone-900 dark:text-stone-100">
                              {meta.label}
                            </h3>
                            <span className="text-xs text-stone-400 dark:text-stone-500 tabular-nums">
                              · {places.length} 處地點 · {totalWorks} 件作品
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
                            {meta.subtitle}
                          </p>
                        </div>
                        <ChevronDown
                          className={`w-4 h-4 text-stone-400 shrink-0 transition-transform duration-200 ${
                            isCollapsed ? '-rotate-90' : 'rotate-0'
                          }`}
                        />
                      </button>

                      {/* Sub-locations & Works */}
                      {!isCollapsed && (
                        <div className="border-t border-stone-100 dark:border-stone-800/80 divide-y divide-stone-100 dark:divide-stone-800/80">
                          {places.map((place) => (
                            <div key={place.placeName} className="p-3.5 sm:px-4 space-y-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0 text-xs font-medium text-[#9E3B33] dark:text-[#E07A70]">
                                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                                  <span className="truncate">{place.placeName}</span>
                                  <span className="text-[11px] text-stone-400 font-normal tabular-nums shrink-0">
                                    ({place.items.length})
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleFlyToWork(place.items[0])}
                                  className="min-h-[30px] px-2.5 rounded-lg text-[11px] font-medium text-stone-600 dark:text-stone-300 bg-[#EFECE6]/70 dark:bg-stone-800/80 hover:bg-[#EFECE6] dark:hover:bg-stone-700 inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                                >
                                  <Navigation className="w-3 h-3" />
                                  <span>在地圖查看</span>
                                </button>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                {place.items.map(({ work }) => (
                                  <button
                                    key={work.id}
                                    type="button"
                                    onClick={() => onSelectWork(work)}
                                    className="p-2.5 rounded-xl border border-stone-200/70 dark:border-stone-800 bg-[#F7F6F2]/70 dark:bg-[#141413] hover:border-[#284152] dark:hover:border-stone-600 text-left flex items-center gap-3 transition-colors"
                                  >
                                    {work.imageData ? (
                                      <img
                                        src={work.imageData}
                                        alt={work.title}
                                        className="w-14 h-14 rounded-lg object-cover shrink-0 border border-stone-200/60 dark:border-stone-800"
                                      />
                                    ) : (
                                      <div className="w-14 h-14 rounded-lg bg-stone-200/70 dark:bg-stone-800 flex items-center justify-center text-stone-400 shrink-0">
                                        <Camera className="w-5 h-5" />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1 space-y-0.5">
                                      <div className="text-xs sm:text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                                        {work.title}
                                      </div>
                                      <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate tabular-nums">
                                        {collectionMap.get(work.collectionId) || '未分類'} ·{' '}
                                        {work.createdAt}
                                      </div>
                                      {work.photoMeta?.camera && (
                                        <div className="text-[10px] text-stone-400 dark:text-stone-500 truncate">
                                          {work.photoMeta.camera}
                                          {work.photoMeta.film ? ` · ${work.photoMeta.film}` : ''}
                                        </div>
                                      )}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
};
