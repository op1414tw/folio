import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SmoothCollapse } from './SmoothCollapse';
import {
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Crop,
  Download,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  ListChecks,
  Maximize2,
  Move,
  RotateCcw,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Type,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useExportQueue } from '../contexts/ExportQueueContext';
import { useMotionPreferences } from '../contexts/MotionConfigContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { BottomSheet } from './BottomSheet';
import { SlidingPill } from './SlidingPill';
import {
  MarkdownRun,
  parseMarkdownBlocks,
} from '../services/markdown';
import {
  saveOrShareGeneratedImage,
  saveOrShareMultipleImages,
} from '../services/storage';
import {
  Collection,
  SavedShareTemplate,
  ShareConfig,
  ShareFontId,
  SharePhotoAspect,
  SharePhotoFit,
  SharePhotoFrameStyle,
  ShareRatio,
  ShareTemplateId,
  WorkItem,
  WorkType,
} from '../types';

interface ShareCardStudioProps {
  works: WorkItem[];
  collections: Collection[];
  initialWork: WorkItem | null;
  authorName: string;
  sealText: string;
  conciseCopyMode?: boolean;
  savedTemplates?: SavedShareTemplate[];
  defaultTemplateId?: string;
  onSaveCustomTemplate?: (tpl: SavedShareTemplate, setAsDefault: boolean) => Promise<void>;
  onDeleteCustomTemplate?: (id: string) => Promise<void>;
  onSetDefaultTemplate?: (id: string) => Promise<void>;
  onClose?: () => void;
  isModal?: boolean;
}

const TEMPLATES: {
  id: ShareTemplateId;
  label: string;
  desc: string;
  defaults: Partial<ShareConfig>;
}[] = [
  {
    id: 'editorial',
    label: '素紙書頁',
    desc: '留白紙感與細線框，適合詩詞與紀實攝影',
    defaults: {
      paperColor: '#F7F6F2',
      textColor: '#1C1917',
      accentColor: '#9E3B33',
      textAlign: 'left',
      padding: 84,
      cornerRadius: 8,
    },
  },
  {
    id: 'polaroid',
    label: '拍立得',
    desc: '經典相紙寬下緣留白與手寫感註記',
    defaults: {
      paperColor: '#FAF9F5',
      textColor: '#292524',
      accentColor: '#78716C',
      textAlign: 'center',
      padding: 64,
      cornerRadius: 4,
    },
  },
  {
    id: 'darkroom',
    label: '暗房畫框',
    desc: '沉穩炭黑展框搭配銀灰參數資訊',
    defaults: {
      paperColor: '#131312',
      textColor: '#E7E5E0',
      accentColor: '#C96458',
      textAlign: 'left',
      padding: 80,
      cornerRadius: 4,
    },
  },
  {
    id: 'postcard',
    label: '極簡明信片',
    desc: '不對稱留白排版與郵戳日期印記',
    defaults: {
      paperColor: '#EFECE4',
      textColor: '#1C1917',
      accentColor: '#284152',
      textAlign: 'left',
      padding: 76,
      cornerRadius: 16,
    },
  },
  {
    id: 'vertical',
    label: '直式文摘',
    desc: '東方直排文字與朱紅落款印章',
    defaults: {
      paperColor: '#F5F2EB',
      textColor: '#1C1917',
      accentColor: '#9E3B33',
      textAlign: 'left',
      padding: 88,
      cornerRadius: 6,
    },
  },
];

const SHARE_FONTS: {
  id: ShareFontId;
  label: string;
  shortLabel: string;
  badge: string;
  sample: string;
  stack: string;
  preloadNames: string[];
}[] = [
  {
    id: 'editorial',
    label: '思源宋體 (Noto Serif TC)',
    shortLabel: '思源宋體',
    badge: '推薦 · 繁中全字集',
    sample: '詩與光影',
    stack:
      '"Noto Serif TC", "Cormorant Garamond", "PingFang TC", "Songti TC", "PMingLiU", Georgia, serif',
    preloadNames: ['Noto Serif TC', 'Cormorant Garamond'],
  },
  {
    id: 'modern-sans',
    label: '思源黑體 (Noto Sans TC)',
    shortLabel: '思源黑體',
    badge: '推薦 · 繁中全字集',
    sample: '現代排版',
    stack:
      '"Noto Sans TC", "Plus Jakarta Sans", "PingFang TC", "Microsoft JhengHei", sans-serif',
    preloadNames: ['Noto Sans TC', 'Plus Jakarta Sans'],
  },
  {
    id: 'handwriting-pen',
    label: '芫荽硬筆 (Iansui)',
    shortLabel: '芫荽硬筆',
    badge: '繁中硬筆',
    sample: '隨筆字跡',
    stack: '"Iansui", "Noto Serif TC", "Kaiti TC", "DFKai-SB", "BiauKai", cursive',
    preloadNames: ['Iansui'],
  },
  {
    id: 'handwriting-brush',
    label: '霞鶩文楷 (LXGW WenKai TC)',
    shortLabel: '霞鶩文楷',
    badge: '繁中楷體',
    sample: '文楷墨韻',
    stack: '"LXGW WenKai TC", "Iansui", "Noto Serif TC", "Kaiti TC", cursive',
    preloadNames: ['LXGW WenKai TC'],
  },
  {
    id: 'handwriting-note',
    label: '粉圓手札 (Huninn)',
    shortLabel: '粉圓手札',
    badge: '繁中圓體',
    sample: '手札溫潤',
    stack: '"Huninn", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif',
    preloadNames: ['Huninn'],
  },
];

const PAPER_SWATCHES = [
  // Light & warm archival papers
  { label: '素紙', paper: '#F7F6F2', text: '#1C1917', accent: '#9E3B33' },
  { label: '米宣', paper: '#EFECE4', text: '#1C1917', accent: '#284152' },
  { label: '燕麥', paper: '#EAE1D3', text: '#29231E', accent: '#8C4A32' },
  { label: '櫻霧', paper: '#F4EAE8', text: '#2E2222', accent: '#A84B47' },
  { label: '茶青', paper: '#E6ECE5', text: '#1E2923', accent: '#3E6251' },
  { label: '晴嵐', paper: '#E5ECF0', text: '#1C2730', accent: '#2D536B' },
  { label: '暮紫', paper: '#ECE7EE', text: '#29222E', accent: '#6B4C7A' },
  { label: '霧灰', paper: '#E2E0DA', text: '#1C1917', accent: '#44403C' },
  // Darkroom & deep ink papers
  { label: '墨黑', paper: '#131312', text: '#E7E5E0', accent: '#C96458' },
  { label: '深靛', paper: '#1D2B36', text: '#F0EFEA', accent: '#D4A373' },
  { label: '松煙', paper: '#1E2723', text: '#EAE8E1', accent: '#C96458' },
  { label: '琥珀褐', paper: '#2B211C', text: '#EFE8DF', accent: '#D49A6A' },
  { label: '暮梅', paper: '#2C1E24', text: '#F0E6E9', accent: '#D9828B' },
  { label: '石板藍', paper: '#232933', text: '#EAECEF', accent: '#7FA1C3' },
];

const PHOTO_FRAME_STYLES: {
  id: SharePhotoFrameStyle;
  label: string;
  desc: string;
}[] = [
  { id: 'none', label: '無框極簡', desc: '純淨滿幅影像，不加邊框' },
  { id: 'hairline', label: '細線裝裱', desc: '極細襯線外框與留白呼吸感' },
  { id: 'gallery-mat', label: '畫廊寬襯', desc: '美術館級厚襯卡紙與雙重邊線' },
  { id: 'embossed', label: '壓紋浮雕', desc: '紙感壓凹內框與立體光影邊緣' },
  { id: 'film-border', label: '底片片齒', desc: '135 底片黑框與經典齒孔印記' },
  { id: 'exif-caption', label: '拍攝銘牌', desc: '底部加印相機、鏡頭與曝光資訊' },
];

function isColorDark(hex: string): boolean {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return false;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 140;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const char of para) {
      const test = current + char;
      if (ctx.measureText(test).width > maxWidth && current.length > 0) {
        lines.push(current);
        current = char;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function parseSharePhotoAspectRatio(
  aspect: SharePhotoAspect | undefined,
  img: HTMLImageElement
): number {
  const natural =
    img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 4 / 3;
  switch (aspect) {
    case '4:3':
      return 4 / 3;
    case '3:2':
      return 3 / 2;
    case '1:1':
      return 1;
    case '16:9':
      return 16 / 9;
    case '3:4':
      return 3 / 4;
    case 'original':
    default:
      return natural;
  }
}

function resolveSharePhotoBoxHeight(
  config: ShareConfig,
  img: HTMLImageElement | null,
  width: number,
  height: number,
  boxW: number,
  cardH?: number
): number {
  if (!img) return 0;
  const targetRatio = parseSharePhotoAspectRatio(config.photoAspect, img);
  const rawDesiredH = Math.round(boxW / Math.max(0.25, targetRatio));

  if (config.template === 'vertical') {
    const minH = Math.round(height * 0.24);
    const maxH = Math.round(height * 0.44);
    if (!config.photoAspect && config.photoFit === 'cover') {
      return Math.round(height * 0.36);
    }
    return Math.max(minH, Math.min(maxH, rawDesiredH));
  }

  if (config.template === 'polaroid') {
    const polaroidCardH = cardH ?? height - Math.round(config.padding * 0.85) * 2;
    const minH = Math.round(polaroidCardH * 0.4);
    const maxH = Math.min(Math.round(polaroidCardH * 0.65), polaroidCardH - 220);
    return Math.max(minH, Math.min(maxH, rawDesiredH));
  }

  // editorial / darkroom / postcard
  const isPostcard = config.template === 'postcard';
  const topY = config.padding + (isPostcard ? 68 : 0);
  const safeMaxH = Math.max(
    Math.round(height * 0.32),
    Math.min(
      Math.round(height * (config.ratio === '9:16' ? 0.54 : 0.56)),
      height - topY - config.padding - 230
    )
  );
  const minH = Math.round(height * 0.24);
  return Math.max(minH, Math.min(safeMaxH, rawDesiredH));
}

function drawStyledPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  config: ShareConfig,
  isDarkPaper: boolean,
  activeWork?: WorkItem | null
) {
  const frameStyle: SharePhotoFrameStyle = config.photoFrameStyle ?? 'none';

  // Compute inner photo viewport after applying the selected gallery/film/EXIF frame
  let innerX = x;
  let innerY = y;
  let innerW = w;
  let innerH = h;
  let innerRadius = radius;

  if (frameStyle === 'hairline') {
    const padF = 12;
    ctx.save();
    ctx.fillStyle = isDarkPaper ? 'rgba(255, 255, 255, 0.035)' : 'rgba(255, 255, 255, 0.65)';
    drawRoundedRect(ctx, x, y, w, h, Math.max(2, radius));
    ctx.fill();
    ctx.strokeStyle = isDarkPaper ? 'rgba(231, 229, 224, 0.28)' : 'rgba(28, 25, 23, 0.22)';
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, x, y, w, h, Math.max(2, radius));
    ctx.stroke();
    ctx.restore();
    innerX = x + padF;
    innerY = y + padF;
    innerW = Math.max(40, w - padF * 2);
    innerH = Math.max(40, h - padF * 2);
    innerRadius = Math.max(0, radius - 4);
  } else if (frameStyle === 'gallery-mat') {
    const padF = Math.max(20, Math.round(Math.min(w, h) * 0.055));
    ctx.save();
    ctx.shadowColor = isDarkPaper ? 'rgba(0,0,0,0.38)' : 'rgba(28,25,23,0.12)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = isDarkPaper ? '#1D1D1B' : '#FCFBF8';
    drawRoundedRect(ctx, x, y, w, h, Math.max(2, radius));
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = isDarkPaper ? 'rgba(231, 229, 224, 0.2)' : 'rgba(28, 25, 23, 0.14)';
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, x, y, w, h, Math.max(2, radius));
    ctx.stroke();

    innerX = x + padF;
    innerY = y + padF;
    innerW = Math.max(40, w - padF * 2);
    innerH = Math.max(40, h - padF * 2);
    innerRadius = 2;

    // Inner bevel window border
    ctx.strokeStyle = isDarkPaper ? 'rgba(231, 229, 224, 0.28)' : 'rgba(28, 25, 23, 0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(innerX - 2, innerY - 2, innerW + 4, innerH + 4);
    ctx.restore();
  } else if (frameStyle === 'embossed') {
    const padF = Math.max(22, Math.round(Math.min(w, h) * 0.06));
    ctx.save();
    ctx.fillStyle = isDarkPaper ? 'rgba(255, 255, 255, 0.045)' : 'rgba(255, 255, 255, 0.55)';
    drawRoundedRect(ctx, x, y, w, h, Math.max(2, radius));
    ctx.fill();

    // Raised outer emboss (top-left highlight, bottom-right subtle shadow)
    ctx.lineWidth = 2;
    ctx.strokeStyle = isDarkPaper ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.moveTo(x + 1, y + h - 1);
    ctx.lineTo(x + 1, y + 1);
    ctx.lineTo(x + w - 1, y + 1);
    ctx.stroke();

    ctx.strokeStyle = isDarkPaper ? 'rgba(0, 0, 0, 0.55)' : 'rgba(28, 25, 23, 0.16)';
    ctx.beginPath();
    ctx.moveTo(x + w - 1, y + 1);
    ctx.lineTo(x + w - 1, y + h - 1);
    ctx.lineTo(x + 1, y + h - 1);
    ctx.stroke();

    // Subtle double debossed groove midway in the mat
    const groove = Math.round(padF * 0.45);
    ctx.strokeStyle = isDarkPaper ? 'rgba(231, 229, 224, 0.14)' : 'rgba(28, 25, 23, 0.11)';
    ctx.lineWidth = 1.25;
    ctx.strokeRect(x + groove, y + groove, w - groove * 2, h - groove * 2);

    innerX = x + padF;
    innerY = y + padF;
    innerW = Math.max(40, w - padF * 2);
    innerH = Math.max(40, h - padF * 2);
    innerRadius = 2;

    // Debossed recess shadow around photograph
    ctx.strokeStyle = isDarkPaper ? 'rgba(0, 0, 0, 0.65)' : 'rgba(28, 25, 23, 0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(innerX - 1, innerY - 1, innerW + 2, innerH + 2);
    ctx.restore();
  } else if (frameStyle === 'film-border') {
    const stripH = Math.max(28, Math.round(h * 0.082));
    const sidePad = 14;
    ctx.save();
    ctx.fillStyle = '#141312';
    drawRoundedRect(ctx, x, y, w, h, Math.min(8, Math.max(4, radius)));
    ctx.fill();

    // Sprocket perforations along top and bottom film tracks
    const perfW = 14;
    const perfH = Math.max(9, Math.round(stripH * 0.36));
    const perfStep = 28;
    const topPerfY = y + Math.round((stripH - perfH) * 0.38);
    const botPerfY = y + h - stripH + Math.round((stripH - perfH) * 0.62);
    ctx.fillStyle = isDarkPaper ? '#2A2927' : '#EFECE6';
    for (let px = x + 18; px + perfW <= x + w - 18; px += perfStep) {
      drawRoundedRect(ctx, px, topPerfY, perfW, perfH, 3);
      ctx.fill();
      drawRoundedRect(ctx, px, botPerfY, perfW, perfH, 3);
      ctx.fill();
    }

    // Subtle amber edge rebate markings
    ctx.fillStyle = 'rgba(218, 165, 92, 0.72)';
    ctx.font = '600 10px "Plus Jakarta Sans", monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('FOLIO · 35MM ARCHIVE', x + 18, y + h - stripH * 0.17);
    ctx.textAlign = 'right';
    ctx.fillText('18A', x + w - 18, y + h - stripH * 0.17);
    ctx.restore();

    innerX = x + sidePad;
    innerY = y + stripH;
    innerW = Math.max(40, w - sidePad * 2);
    innerH = Math.max(40, h - stripH * 2);
    innerRadius = 2;
  } else if (frameStyle === 'exif-caption') {
    const borderPad = 12;
    const capH = Math.max(50, Math.round(h * 0.12));
    ctx.save();
    ctx.fillStyle = isDarkPaper ? '#1C1C1A' : '#FFFFFF';
    drawRoundedRect(ctx, x, y, w, h, Math.max(4, radius));
    ctx.fill();
    ctx.strokeStyle = isDarkPaper ? 'rgba(231, 229, 224, 0.22)' : 'rgba(28, 25, 23, 0.16)';
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, x, y, w, h, Math.max(4, radius));
    ctx.stroke();

    innerX = x + borderPad;
    innerY = y + borderPad;
    innerW = Math.max(40, w - borderPad * 2);
    innerH = Math.max(40, h - borderPad - capH);
    innerRadius = 2;

    // Hairline rule separating photo & caption plate
    const barY = innerY + innerH + 10;
    ctx.strokeStyle = isDarkPaper ? 'rgba(231, 229, 224, 0.12)' : 'rgba(28, 25, 23, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(innerX, barY);
    ctx.lineTo(innerX + innerW, barY);
    ctx.stroke();

    const meta = activeWork?.photoMeta;
    const gearLeft =
      [meta?.camera, meta?.lens].filter(Boolean).join(' · ') ||
      activeWork?.title ||
      'PHOTOGRAPH';
    const settingsRight =
      [
        meta?.aperture,
        meta?.shutter,
        meta?.iso ? `ISO ${meta.iso}` : '',
        meta?.film,
      ]
        .filter(Boolean)
        .join('  ') ||
      activeWork?.createdAt ||
      '';

    const textY = barY + Math.max(18, Math.round((capH - 12) * 0.48));
    ctx.fillStyle = isDarkPaper ? 'rgba(231, 229, 224, 0.85)' : 'rgba(28, 25, 23, 0.82)';
    ctx.font = '600 17px "Plus Jakarta Sans", "PingFang TC", "Microsoft JhengHei", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(gearLeft.slice(0, 34), innerX + 2, textY);

    if (settingsRight) {
      ctx.fillStyle = isDarkPaper ? 'rgba(231, 229, 224, 0.56)' : 'rgba(28, 25, 23, 0.54)';
      ctx.font = '400 16px "Plus Jakarta Sans", "PingFang TC", "Microsoft JhengHei", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(settingsRight.slice(0, 36), innerX + innerW - 2, textY);
    }
    ctx.restore();
  }

  ctx.save();
  drawRoundedRect(ctx, innerX, innerY, innerW, innerH, innerRadius);
  ctx.clip();

  // Subtle archival frame mat when full-frame photo has slight margins inside clamped box
  ctx.fillStyle = isDarkPaper ? 'rgba(255, 255, 255, 0.04)' : 'rgba(28, 25, 23, 0.035)';
  ctx.fillRect(innerX, innerY, innerW, innerH);

  const imgRatio = img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : innerW / innerH;
  const boxRatio = innerW / innerH;
  const fit: SharePhotoFit = config.photoFit ?? 'contain';
  const zoom = Math.max(1, Math.min(2.2, config.photoZoom ?? 1));
  const offX = Math.max(-100, Math.min(100, config.photoOffsetX ?? 0)) / 100;
  const offY = Math.max(-100, Math.min(100, config.photoOffsetY ?? 0)) / 100;

  let baseW = innerW;
  let baseH = innerH;
  if (fit === 'contain') {
    if (imgRatio > boxRatio) {
      baseW = innerW;
      baseH = innerW / imgRatio;
    } else {
      baseH = innerH;
      baseW = innerH * imgRatio;
    }
  } else {
    if (imgRatio > boxRatio) {
      baseH = innerH;
      baseW = innerH * imgRatio;
    } else {
      baseW = innerW;
      baseH = innerW / imgRatio;
    }
  }

  const drawW = baseW * zoom;
  const drawH = baseH * zoom;

  let drawX: number;
  if (drawW > innerW + 0.5) {
    const slackX = (drawW - innerW) / 2;
    drawX = innerX - slackX * (1 + offX);
  } else {
    drawX = innerX + (innerW - drawW) / 2;
  }

  let drawY: number;
  if (drawH > innerH + 0.5) {
    const slackY = (drawH - innerH) / 2;
    drawY = innerY - slackY * (1 + offY);
  } else {
    drawY = innerY + (innerH - drawH) / 2;
  }

  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  ctx.restore();
}

interface VerticalGlyphPlacement {
  ch: string;
  x: number;
  y: number;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
}

interface StyledLine {
  runs: MarkdownRun[];
  isBlank?: boolean;
  isHeading?: boolean;
  headingLevel?: number;
  isQuote?: boolean;
  isHr?: boolean;
  marker?: string;
}

interface ComputedPagination {
  totalPages: number;
  horizontalPages: StyledLine[][];
  verticalPages: VerticalGlyphPlacement[][];
  overflowsSinglePage: boolean;
  pageOverflows?: boolean[];
}

function buildCanvasFont(
  fontPx: number,
  fontStack: string,
  opts?: { bold?: boolean; italic?: boolean }
): string {
  const style = opts?.italic ? 'italic ' : '';
  const weight = opts?.bold ? '700' : '400';
  return `${style}${weight} ${fontPx}px ${fontStack}`;
}

function wrapStyledMarkdownLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  baseFontPx: number,
  fontStack: string,
  useMarkdown: boolean
): StyledLine[] {
  const blocks = parseMarkdownBlocks(text, useMarkdown);
  const result: StyledLine[] = [];

  for (const block of blocks) {
    if (block.type === 'blank') {
      result.push({ runs: [], isBlank: true });
      continue;
    }
    if (block.type === 'hr') {
      result.push({ runs: [{ text: '────────' }], isHr: true });
      continue;
    }

    const isHeading = block.type === 'heading';
    const isQuote = block.type === 'quote';
    const fontPx = isHeading
      ? Math.round(baseFontPx * (block.level === 1 ? 1.18 : 1.08))
      : baseFontPx;
    const indent = isQuote ? 24 : block.type === 'list-item' ? 32 : 0;
    const availW = Math.max(80, maxWidth - indent);

    let currentRuns: MarkdownRun[] = [];
    let currentWidth = 0;
    let isFirstLineOfBlock = true;

    const pushCurrentLine = () => {
      result.push({
        runs: currentRuns,
        isHeading,
        headingLevel: block.level,
        isQuote,
        marker: isFirstLineOfBlock ? block.marker : block.type === 'list-item' ? '' : undefined,
      });
      currentRuns = [];
      currentWidth = 0;
      isFirstLineOfBlock = false;
    };

    for (const run of block.runs) {
      const effectiveBold = Boolean(run.bold || isHeading);
      const effectiveItalic = Boolean(run.italic || isQuote);
      ctx.font = buildCanvasFont(fontPx, fontStack, {
        bold: effectiveBold,
        italic: effectiveItalic,
      });

      let buf = '';
      for (const char of run.text) {
        const charW = ctx.measureText(char).width;
        if (currentWidth + charW > availW && (currentRuns.length > 0 || buf.length > 0)) {
          if (buf) {
            currentRuns.push({
              ...run,
              bold: effectiveBold,
              italic: effectiveItalic,
              text: buf,
            });
            buf = '';
          }
          pushCurrentLine();
        }
        buf += char;
        currentWidth += charW;
      }
      if (buf) {
        currentRuns.push({
          ...run,
          bold: effectiveBold,
          italic: effectiveItalic,
          text: buf,
        });
      }
    }

    if (currentRuns.length > 0 || isFirstLineOfBlock) {
      pushCurrentLine();
    }
  }

  return result;
}

function styledLinesToPlainText(lines: StyledLine[]): string {
  return lines
    .map((l) => {
      if (l.isBlank) return '';
      if (l.isHr) return '---';
      const txt = l.runs.map((r) => r.text).join('');
      if (l.isQuote) return `> ${txt}`;
      if (l.isHeading) {
        const hashes = '#'.repeat(l.headingLevel || 2);
        return `${hashes} ${txt}`;
      }
      if (l.marker) return `${l.marker === '•' ? '-' : l.marker} ${txt}`;
      return txt;
    })
    .join('\n');
}

function drawStyledLine(
  ctx: CanvasRenderingContext2D,
  line: StyledLine,
  anchorX: number,
  y: number,
  baseFontPx: number,
  fontStack: string,
  textAlign: 'left' | 'center',
  baseColor: string,
  accentColor: string,
  isDarkPaper: boolean
) {
  if (line.isBlank) return;

  const fontPx = line.isHeading
    ? Math.round(baseFontPx * (line.headingLevel === 1 ? 1.18 : 1.08))
    : baseFontPx;

  let totalRunsW = 0;
  const runWidths: number[] = [];

  for (const run of line.runs) {
    ctx.font = buildCanvasFont(fontPx, fontStack, {
      bold: Boolean(run.bold || line.isHeading),
      italic: Boolean(run.italic || line.isQuote),
    });
    const w = ctx.measureText(run.text).width + (run.code ? 12 : 0);
    runWidths.push(w);
    totalRunsW += w;
  }

  const markerText = line.marker ? `${line.marker} ` : '';
  let markerW = 0;
  if (markerText) {
    ctx.font = buildCanvasFont(fontPx, fontStack);
    markerW = ctx.measureText(markerText).width;
  } else if (line.marker === '') {
    ctx.font = buildCanvasFont(fontPx, fontStack);
    markerW = ctx.measureText('• ').width;
  }

  const quotePad = line.isQuote ? 22 : 0;
  const fullLineW = quotePad + markerW + totalRunsW;
  let drawX = textAlign === 'center' ? anchorX - fullLineW / 2 : anchorX;

  ctx.save();
  ctx.textAlign = 'left';

  if (line.isQuote) {
    ctx.fillStyle = accentColor;
    ctx.globalAlpha = 0.72;
    ctx.fillRect(drawX, y - fontPx * 0.78, 4, fontPx * 0.98);
    ctx.globalAlpha = 1;
    drawX += quotePad;
  }

  if (markerText) {
    ctx.font = buildCanvasFont(fontPx, fontStack);
    ctx.fillStyle = accentColor;
    ctx.fillText(markerText, drawX, y);
    drawX += markerW;
  } else if (line.marker === '') {
    drawX += markerW;
  }

  for (let i = 0; i < line.runs.length; i++) {
    const run = line.runs[i];
    const w = runWidths[i];
    ctx.font = buildCanvasFont(fontPx, fontStack, {
      bold: Boolean(run.bold || line.isHeading),
      italic: Boolean(run.italic || line.isQuote),
    });

    if (run.code) {
      ctx.fillStyle = isDarkPaper
        ? 'rgba(255, 255, 255, 0.11)'
        : 'rgba(40, 65, 82, 0.08)';
      drawRoundedRect(ctx, drawX + 2, y - fontPx * 0.85, w - 4, fontPx * 1.12, 6);
      ctx.fill();
    }

    ctx.fillStyle = line.isQuote
      ? isDarkPaper
        ? 'rgba(231, 229, 224, 0.74)'
        : 'rgba(28, 25, 23, 0.7)'
      : baseColor;

    const textX = run.code ? drawX + 6 : drawX;
    ctx.fillText(run.text, textX, y);

    if (run.strike) {
      const strikeY = y - fontPx * 0.32;
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = Math.max(1.8, fontPx * 0.065);
      ctx.beginPath();
      ctx.moveTo(textX, strikeY);
      ctx.lineTo(textX + (run.code ? w - 12 : w), strikeY);
      ctx.stroke();
    }

    drawX += w;
  }
  ctx.restore();
}

function splitTextIntoPaginationUnits(
  text: string,
  mode: 'paragraph' | 'sentence'
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (mode === 'paragraph') {
    return trimmed
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const paragraphs = trimmed
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const units: string[] = [];
  for (const para of paragraphs) {
    const sentences = para
      .split(/(?<=[。！？!?；;…])/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length > 0) {
      units.push(...sentences);
    }
  }
  return units;
}

function layoutVerticalBlockText(
  text: string,
  mdEnabled: boolean,
  colFontSize: number,
  colLineHeight: number,
  colSpacing: number,
  contentTop: number,
  quoteBottomLimit: number,
  startColX: number,
  minColX: number
): { placements: VerticalGlyphPlacement[]; overflowed: boolean } {
  const blocks = parseMarkdownBlocks(text, mdEnabled);
  const placements: VerticalGlyphPlacement[] = [];
  let colX = startColX;
  let overflowed = false;

  for (let pIdx = 0; pIdx < blocks.length; pIdx++) {
    const block = blocks[pIdx];
    let curY = contentTop;
    if (block.type === 'blank') {
      colX -= colSpacing * 0.6;
      if (colX < minColX) overflowed = true;
      continue;
    }
    for (const run of block.runs) {
      for (const ch of run.text) {
        if (curY + colLineHeight > quoteBottomLimit) {
          colX -= colSpacing;
          curY = contentTop;
        }
        if (colX < minColX) {
          overflowed = true;
          continue;
        }
        placements.push({
          ch,
          x: colX,
          y: curY,
          bold: Boolean(run.bold || block.type === 'heading'),
          italic: Boolean(run.italic || block.type === 'quote'),
          strike: Boolean(run.strike),
        });
        curY += colLineHeight;
      }
    }
    if (pIdx < blocks.length - 1) {
      colX -= colSpacing;
      if (colX < minColX && pIdx < blocks.length - 2) {
        overflowed = true;
      }
    }
  }

  return { placements, overflowed };
}

function computeSharePagination(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: ShareConfig,
  loadedImg: HTMLImageElement | null,
  manualPages?: string[][] | null
): ComputedPagination {
  const pad = config.padding;
  const innerW = width - pad * 2;
  const scale = config.fontSize;
  const fontDef = SHARE_FONTS.find((f) => f.id === config.fontFamily) || SHARE_FONTS[0];
  const activeFontStack = fontDef.stack;
  const mdEnabled = config.useMarkdown ?? true;

  // 1. VERTICAL TEMPLATE PAGINATION
  if (config.template === 'vertical') {
    const colFontSize = Math.round(36 * scale);
    const colLineHeight = Math.round(colFontSize * 1.42);
    const colSpacing = Math.round(colFontSize * 1.85);
    const quoteBottomLimit = height - pad - 120;
    const rightStartX = width - pad - colFontSize * 0.6;
    const dividerX = rightStartX - colSpacing * 0.72;

    const photoH = loadedImg
      ? resolveSharePhotoBoxHeight(config, loadedImg, width, height, innerW)
      : 0;
    const firstTop = loadedImg ? pad + photoH + 56 : pad;
    const nextTop = pad + 24;

    if (manualPages && manualPages.length > 0) {
      const verticalPages: VerticalGlyphPlacement[][] = [];
      const pageOverflows: boolean[] = [];
      for (let i = 0; i < manualPages.length; i++) {
        const text = manualPages[i].join('\n');
        const startX = i === 0 ? dividerX - colSpacing * 0.75 : rightStartX;
        const cTop = i === 0 ? firstTop : nextTop;
        const res = layoutVerticalBlockText(
          text,
          mdEnabled,
          colFontSize,
          colLineHeight,
          colSpacing,
          cTop,
          quoteBottomLimit,
          startX,
          pad + 20
        );
        verticalPages.push(res.placements);
        pageOverflows.push(res.overflowed);
      }
      return {
        totalPages: verticalPages.length,
        horizontalPages: [],
        verticalPages,
        overflowsSinglePage: verticalPages.length > 1,
        pageOverflows,
      };
    }

    const pages: VerticalGlyphPlacement[][] = [[]];
    let pageIdx = 0;
    let contentTop = firstTop;
    let colX = dividerX - colSpacing * 0.75;

    const blocks = parseMarkdownBlocks(config.customQuote, mdEnabled);
    for (let pIdx = 0; pIdx < blocks.length; pIdx++) {
      const block = blocks[pIdx];
      let curY = contentTop;
      if (block.type === 'blank') {
        colX -= colSpacing * 0.6;
        if (colX < pad + 20) {
          pageIdx++;
          pages.push([]);
          contentTop = nextTop;
          colX = width - pad - colFontSize * 0.6;
        }
        continue;
      }
      for (const run of block.runs) {
        for (const ch of run.text) {
          if (curY + colLineHeight > quoteBottomLimit) {
            colX -= colSpacing;
            curY = contentTop;
          }
          if (colX < pad + 20) {
            pageIdx++;
            pages.push([]);
            contentTop = nextTop;
            colX = width - pad - colFontSize * 0.6;
            curY = contentTop;
          }
          pages[pageIdx].push({
            ch,
            x: colX,
            y: curY,
            bold: Boolean(run.bold || block.type === 'heading'),
            italic: Boolean(run.italic || block.type === 'quote'),
            strike: Boolean(run.strike),
          });
          curY += colLineHeight;
        }
      }
      if (pIdx < blocks.length - 1) {
        colX -= colSpacing;
        if (colX < pad + 20) {
          pageIdx++;
          pages.push([]);
          contentTop = nextTop;
          colX = width - pad - colFontSize * 0.6;
        }
      }
    }

    return {
      totalPages: Math.max(1, pages.length),
      horizontalPages: [],
      verticalPages: pages,
      overflowsSinglePage: pages.length > 1,
    };
  }

  // 2. POLAROID TEMPLATE PAGINATION
  if (config.template === 'polaroid') {
    const frameMargin = Math.round(pad * 0.85);
    const cardW = width - frameMargin * 2;
    const cardH = height - frameMargin * 2;
    const innerPad = 48;
    const photoW = cardW - innerPad * 2;
    const photoH = loadedImg
      ? resolveSharePhotoBoxHeight(config, loadedImg, width, height, photoW, cardH)
      : Math.round(cardH * 0.64);
    const lineH = Math.round(54 * scale);
    const capPerPage = Math.max(3, Math.floor((photoH - (loadedImg ? 96 : 80)) / lineH));

    if (manualPages && manualPages.length > 0) {
      const horizontalPages: StyledLine[][] = [];
      const pageOverflows: boolean[] = [];
      for (let i = 0; i < manualPages.length; i++) {
        const text = manualPages[i].join('\n');
        if (loadedImg && i === 0) {
          const capLines = wrapStyledMarkdownLines(
            ctx,
            text,
            photoW,
            Math.round(26 * scale),
            activeFontStack,
            mdEnabled
          );
          pageOverflows.push(capLines.length > 2);
          horizontalPages.push(capLines.slice(0, 2));
        } else {
          const bodyFontPx = Math.round((loadedImg ? 35 : 36) * scale);
          const bodyLines = wrapStyledMarkdownLines(
            ctx,
            text,
            photoW - 96,
            bodyFontPx,
            activeFontStack,
            mdEnabled
          );
          pageOverflows.push(bodyLines.length > capPerPage);
          horizontalPages.push(bodyLines.slice(0, capPerPage));
        }
      }
      return {
        totalPages: horizontalPages.length,
        horizontalPages,
        verticalPages: [],
        overflowsSinglePage: horizontalPages.length > 1,
        pageOverflows,
      };
    }

    if (loadedImg) {
      const captionFontPx = Math.round(26 * scale);
      const page0Lines = wrapStyledMarkdownLines(
        ctx,
        config.customQuote,
        photoW,
        captionFontPx,
        activeFontStack,
        mdEnabled
      );
      if (page0Lines.length <= 2) {
        return {
          totalPages: 1,
          horizontalPages: [page0Lines],
          verticalPages: [],
          overflowsSinglePage: false,
        };
      }
      const firstPage = page0Lines.slice(0, 2);
      const restText = styledLinesToPlainText(page0Lines.slice(2));
      const restFontPx = Math.round(35 * scale);
      const restLines = wrapStyledMarkdownLines(
        ctx,
        restText,
        photoW - 96,
        restFontPx,
        activeFontStack,
        mdEnabled
      );
      const pages: StyledLine[][] = [firstPage];
      for (let i = 0; i < restLines.length; i += capPerPage) {
        pages.push(restLines.slice(i, i + capPerPage));
      }
      return {
        totalPages: pages.length,
        horizontalPages: pages,
        verticalPages: [],
        overflowsSinglePage: pages.length > 1,
      };
    } else {
      const fontPx = Math.round(36 * scale);
      const allLines = wrapStyledMarkdownLines(
        ctx,
        config.customQuote,
        photoW - 96,
        fontPx,
        activeFontStack,
        mdEnabled
      );
      const pages: StyledLine[][] = [];
      for (let i = 0; i < allLines.length; i += capPerPage) {
        pages.push(allLines.slice(i, i + capPerPage));
      }
      if (pages.length === 0) pages.push([]);
      return {
        totalPages: pages.length,
        horizontalPages: pages,
        verticalPages: [],
        overflowsSinglePage: pages.length > 1,
      };
    }
  }

  // 3. EDITORIAL / DARKROOM / POSTCARD PAGINATION
  const isPostcard = config.template === 'postcard';
  let page0Y = pad + (isPostcard ? 68 : 0);
  if (loadedImg) {
    const imgMaxH = resolveSharePhotoBoxHeight(config, loadedImg, width, height, innerW);
    page0Y += imgMaxH + 56;
  } else {
    page0Y += 36;
  }

  ctx.font = `600 ${Math.round(50 * scale)}px ${activeFontStack}`;
  const titleLinesCount = Math.min(
    2,
    Math.max(1, wrapTextLines(ctx, config.customTitle, innerW).length)
  );
  page0Y += titleLinesCount * Math.round(62 * scale) + 12;

  const footerLimit = height - pad - 108;
  const page0FontPx = Math.round((loadedImg ? 29 : 36) * scale);
  const page0LineH = Math.round(page0FontPx * 1.65);
  const page0Cap = Math.max(
    1,
    Math.floor((footerLimit - page0Y) / page0LineH) + 1
  );

  const contFontPx = Math.round(36 * scale);
  const contLineH = Math.round(contFontPx * 1.65);
  const contStartY = pad + (isPostcard ? 68 : 20) + Math.round(68 * scale);
  const contCap = Math.max(
    3,
    Math.floor((footerLimit - contStartY) / contLineH) + 1
  );

  if (manualPages && manualPages.length > 0) {
    const horizontalPages: StyledLine[][] = [];
    const pageOverflows: boolean[] = [];
    for (let i = 0; i < manualPages.length; i++) {
      const text = manualPages[i].join('\n');
      const fontPx = i === 0 ? page0FontPx : contFontPx;
      const cap = i === 0 ? page0Cap : contCap;
      const wrapped = wrapStyledMarkdownLines(
        ctx,
        text,
        innerW,
        fontPx,
        activeFontStack,
        mdEnabled
      );
      pageOverflows.push(wrapped.length > cap);
      horizontalPages.push(wrapped.slice(0, cap));
    }
    return {
      totalPages: horizontalPages.length,
      horizontalPages,
      verticalPages: [],
      overflowsSinglePage: horizontalPages.length > 1,
      pageOverflows,
    };
  }

  const page0AllLines = wrapStyledMarkdownLines(
    ctx,
    config.customQuote,
    innerW,
    page0FontPx,
    activeFontStack,
    mdEnabled
  );

  if (page0AllLines.length <= page0Cap || !config.customQuote.trim()) {
    return {
      totalPages: 1,
      horizontalPages: [page0AllLines.slice(0, page0Cap)],
      verticalPages: [],
      overflowsSinglePage: false,
    };
  }

  const firstSlice = page0AllLines.slice(0, page0Cap);
  const remainingText = styledLinesToPlainText(page0AllLines.slice(page0Cap));

  const contLines = wrapStyledMarkdownLines(
    ctx,
    remainingText,
    innerW,
    contFontPx,
    activeFontStack,
    mdEnabled
  );
  while (contLines.length > 0 && contLines[0].isBlank) contLines.shift();

  const pages: StyledLine[][] = [firstSlice];
  let idx = 0;
  while (idx < contLines.length) {
    const chunk = contLines.slice(idx, idx + contCap);
    while (chunk.length > 0 && chunk[0].isBlank) chunk.shift();
    if (chunk.length > 0) {
      pages.push(chunk);
    }
    idx += contCap;
  }

  return {
    totalPages: Math.max(1, pages.length),
    horizontalPages: pages,
    verticalPages: [],
    overflowsSinglePage: pages.length > 1,
  };
}

function packUnitsWithoutSplitting(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: ShareConfig,
  loadedImg: HTMLImageElement | null,
  units: string[]
): string[][] {
  if (units.length === 0) return [[]];

  const pad = config.padding;
  const innerW = width - pad * 2;
  const scale = config.fontSize;
  const fontDef = SHARE_FONTS.find((f) => f.id === config.fontFamily) || SHARE_FONTS[0];
  const activeFontStack = fontDef.stack;
  const mdEnabled = config.useMarkdown ?? true;

  const fitsOnPage = (candidateUnits: string[], pageIdx: number): boolean => {
    const joined = candidateUnits.join('\n');
    if (config.template === 'vertical') {
      const colFontSize = Math.round(36 * scale);
      const colLineHeight = Math.round(colFontSize * 1.42);
      const colSpacing = Math.round(colFontSize * 1.85);
      const quoteBottomLimit = height - pad - 120;
      const rightStartX = width - pad - colFontSize * 0.6;
      const dividerX = rightStartX - colSpacing * 0.72;
      const photoH = loadedImg
        ? resolveSharePhotoBoxHeight(config, loadedImg, width, height, innerW)
        : 0;
      const cTop = pageIdx === 0 ? (loadedImg ? pad + photoH + 56 : pad) : pad + 24;
      const startX = pageIdx === 0 ? dividerX - colSpacing * 0.75 : rightStartX;
      return !layoutVerticalBlockText(
        joined,
        mdEnabled,
        colFontSize,
        colLineHeight,
        colSpacing,
        cTop,
        quoteBottomLimit,
        startX,
        pad + 20
      ).overflowed;
    }

    if (config.template === 'polaroid') {
      const frameMargin = Math.round(pad * 0.85);
      const cardW = width - frameMargin * 2;
      const cardH = height - frameMargin * 2;
      const photoW = cardW - 96;
      const photoH = loadedImg
        ? resolveSharePhotoBoxHeight(config, loadedImg, width, height, photoW, cardH)
        : Math.round(cardH * 0.64);
      if (loadedImg && pageIdx === 0) {
        const lines = wrapStyledMarkdownLines(
          ctx,
          joined,
          photoW,
          Math.round(26 * scale),
          activeFontStack,
          mdEnabled
        );
        return lines.length <= 2;
      }
      const capPerPage = Math.max(
        3,
        Math.floor((photoH - (loadedImg ? 96 : 80)) / Math.round(54 * scale))
      );
      const lines = wrapStyledMarkdownLines(
        ctx,
        joined,
        photoW - 96,
        Math.round((loadedImg ? 35 : 36) * scale),
        activeFontStack,
        mdEnabled
      );
      return lines.length <= capPerPage;
    }

    const isPostcard = config.template === 'postcard';
    let page0Y = pad + (isPostcard ? 68 : 0);
    if (loadedImg) {
      page0Y += resolveSharePhotoBoxHeight(config, loadedImg, width, height, innerW) + 56;
    } else {
      page0Y += 36;
    }
    ctx.font = `600 ${Math.round(50 * scale)}px ${activeFontStack}`;
    const titleLinesCount = Math.min(
      2,
      Math.max(1, wrapTextLines(ctx, config.customTitle, innerW).length)
    );
    page0Y += titleLinesCount * Math.round(62 * scale) + 12;
    const footerLimit = height - pad - 108;
    const page0FontPx = Math.round((loadedImg ? 29 : 36) * scale);
    const page0Cap = Math.max(
      1,
      Math.floor((footerLimit - page0Y) / Math.round(page0FontPx * 1.65)) + 1
    );
    const contFontPx = Math.round(36 * scale);
    const contStartY = pad + (isPostcard ? 68 : 20) + Math.round(68 * scale);
    const contCap = Math.max(
      3,
      Math.floor((footerLimit - contStartY) / Math.round(contFontPx * 1.65)) + 1
    );
    const fontPx = pageIdx === 0 ? page0FontPx : contFontPx;
    const cap = pageIdx === 0 ? page0Cap : contCap;
    const lines = wrapStyledMarkdownLines(ctx, joined, innerW, fontPx, activeFontStack, mdEnabled);
    return lines.length <= cap;
  };

  const result: string[][] = [];
  let current: string[] = [];

  for (const unit of units) {
    if (current.length === 0) {
      current.push(unit);
      continue;
    }
    if (fitsOnPage([...current, unit], result.length)) {
      current.push(unit);
    } else {
      result.push(current);
      current = [unit];
    }
  }
  if (current.length > 0) {
    result.push(current);
  }
  return result.length > 0 ? result : [[]];
}

/**
 * Automatically computes optimal font scale & line fit based on canvas size,
 * image presence, template padding, and text length when Auto-Flow Layout is enabled.
 */
function resolveAutoFlowScale(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: ShareConfig,
  loadedImg: HTMLImageElement | null,
  shareMode: 'single' | 'multi'
): number {
  if (!config.autoFlowLayout) return config.fontSize;

  const charCount = config.customQuote.replace(/\s+/g, '').length;

  if (shareMode === 'multi') {
    const baseByRatio =
      config.ratio === '9:16' ? 1.06 : config.ratio === '1:1' ? 0.9 : 0.98;
    if (charCount > 0 && charCount <= 48) {
      return Math.min(1.18, baseByRatio + 0.12);
    }
    return baseByRatio;
  }

  const candidates = [
    1.2, 1.15, 1.1, 1.05, 1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65,
  ];
  for (const s of candidates) {
    if (charCount > 120 && s > 1.05) continue;
    if (charCount > 240 && s > 0.95) continue;
    const pag = computeSharePagination(
      ctx,
      width,
      height,
      { ...config, fontSize: s },
      loadedImg
    );
    if (!pag.overflowsSinglePage) {
      return s;
    }
  }
  return 0.65;
}

function drawShareCardPage(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: ShareConfig,
  activeWork: WorkItem | null,
  loadedImg: HTMLImageElement | null,
  pagination: ComputedPagination,
  pageIndex: number
) {
  const pad = config.padding;
  const innerW = width - pad * 2;
  const scale = config.fontSize;
  const fontDef = SHARE_FONTS.find((f) => f.id === config.fontFamily) || SHARE_FONTS[0];
  const activeFontStack = fontDef.stack;
  const sansFont = '"Plus Jakarta Sans", "PingFang TC", "Microsoft JhengHei", sans-serif';
  const totalPages = pagination.totalPages;
  const safePageIdx = Math.min(pageIndex, totalPages - 1);

  // Background Paper
  ctx.fillStyle = config.paperColor;
  ctx.fillRect(0, 0, width, height);

  // Subtle paper grain texture dots
  ctx.fillStyle = config.textColor;
  ctx.globalAlpha = 0.018;
  for (let i = 0; i < 650; i++) {
    const gx = (i * 733) % width;
    const gy = (i * 499) % height;
    ctx.fillRect(gx, gy, 2, 2);
  }
  ctx.globalAlpha = 1;

  const isDarkPaper = isColorDark(config.paperColor);

  const hairlineColor = isDarkPaper
    ? 'rgba(231, 229, 224, 0.16)'
    : 'rgba(28, 25, 23, 0.12)';
  const mutedTextColor = isDarkPaper
    ? 'rgba(231, 229, 224, 0.64)'
    : 'rgba(28, 25, 23, 0.56)';

  const drawSeal = (sx: number, sy: number, size = 46) => {
    if (!config.showSeal || !config.sealText.trim()) return;
    ctx.save();
    ctx.fillStyle = config.accentColor;
    drawRoundedRect(ctx, sx, sy, size, size, 6);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `600 ${Math.round(size * 0.54)}px ${activeFontStack}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(config.sealText.trim().slice(0, 1), sx + size / 2, sy + size / 2 + 1);
    ctx.restore();
  };

  const metaString = activeWork
    ? activeWork.type === 'photography'
      ? [activeWork.photoMeta?.camera, activeWork.photoMeta?.film, activeWork.photoMeta?.location]
          .filter(Boolean)
          .join(' · ')
      : activeWork.writingGenre || '文字手記'
    : '拾光卷宗';

  const pageLabel =
    totalPages > 1
      ? `${String(safePageIdx + 1).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`
      : '';

  // TEMPLATE 5: VERTICAL LITERARY (直式文摘)
  if (config.template === 'vertical') {
    ctx.strokeStyle = hairlineColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(pad * 0.55, pad * 0.55, width - pad * 1.1, height - pad * 1.1);

    if (safePageIdx === 0) {
      let contentTop = pad;
      if (loadedImg) {
        const imgH = resolveSharePhotoBoxHeight(config, loadedImg, width, height, innerW);
        drawStyledPhoto(ctx, loadedImg, pad, pad, innerW, imgH, config.cornerRadius, config, isDarkPaper, activeWork);
        contentTop = pad + imgH + 56;
      }

      const colFontSize = Math.round(36 * scale);
      const colSpacing = Math.round(colFontSize * 1.85);
      const quoteBottomLimit = height - pad - 120;
      const rightStartX = width - pad - colFontSize * 0.6;

      ctx.fillStyle = config.textColor;
      ctx.font = `600 ${Math.round(44 * scale)}px ${activeFontStack}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      let titleY = contentTop;
      for (const ch of config.customTitle.slice(0, 14)) {
        ctx.fillText(ch, rightStartX, titleY);
        titleY += Math.round(50 * scale);
      }

      const dividerX = rightStartX - colSpacing * 0.72;
      ctx.strokeStyle = hairlineColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(dividerX, contentTop);
      ctx.lineTo(dividerX, Math.min(quoteBottomLimit, contentTop + 340));
      ctx.stroke();
    }

    const colFontSize = Math.round(36 * scale);
    ctx.fillStyle = config.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const placements = pagination.verticalPages[safePageIdx] || [];
    for (const item of placements) {
      ctx.font = buildCanvasFont(colFontSize, activeFontStack, {
        bold: item.bold,
        italic: item.italic,
      });
      const rotatedPunctuation = ['，', '。', '、', '：', '；'].includes(item.ch);
      if (rotatedPunctuation) {
        ctx.fillText(item.ch, item.x + colFontSize * 0.22, item.y - colFontSize * 0.14);
      } else {
        ctx.fillText(item.ch, item.x, item.y);
      }
      if (item.strike) {
        ctx.strokeStyle = config.textColor;
        ctx.lineWidth = Math.max(2, colFontSize * 0.06);
        ctx.beginPath();
        ctx.moveTo(item.x, item.y + colFontSize * 0.08);
        ctx.lineTo(item.x, item.y + colFontSize * 0.96);
        ctx.stroke();
      }
    }

    const footerY = height - pad;
    drawSeal(pad, footerY - 48, 48);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = mutedTextColor;
    ctx.font = `400 24px ${sansFont}`;
    const footerParts = [
      config.showAuthor ? config.authorName : '',
      config.showDate && activeWork ? activeWork.createdAt : '',
      config.showMeta ? metaString : '',
      pageLabel,
    ].filter(Boolean);
    ctx.fillText(footerParts.join(' · '), config.showSeal ? pad + 68 : pad, footerY - 14);
    return;
  }

  // TEMPLATE 2: POLAROID (拍立得)
  if (config.template === 'polaroid') {
    const frameMargin = Math.round(pad * 0.85);
    const cardX = frameMargin;
    const cardY = frameMargin;
    const cardW = width - frameMargin * 2;
    const cardH = height - frameMargin * 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.12)';
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = isDarkPaper ? 'rgba(255, 255, 255, 0.045)' : '#FFFFFF';
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 12);
    ctx.fill();
    ctx.restore();

    const innerPad = 48;
    const photoX = cardX + innerPad;
    const photoY = cardY + innerPad;
    const photoW = cardW - innerPad * 2;
    const photoH = loadedImg
      ? resolveSharePhotoBoxHeight(config, loadedImg, width, height, photoW, cardH)
      : Math.round(cardH * 0.64);
    const lines = pagination.horizontalPages[safePageIdx] || [];

    if (loadedImg && safePageIdx === 0) {
      drawStyledPhoto(ctx, loadedImg, photoX, photoY, photoW, photoH, config.cornerRadius, config, isDarkPaper, activeWork);

      const captionY = photoY + photoH + 64;
      ctx.textAlign = config.textAlign;
      const anchorX = config.textAlign === 'center' ? width / 2 : photoX;
      ctx.fillStyle = config.textColor;
      ctx.font = `600 ${Math.round(40 * scale)}px ${activeFontStack}`;
      ctx.fillText(config.customTitle, anchorX, captionY);

      if (lines.length > 0) {
        const capFontPx = Math.round(26 * scale);
        lines.slice(0, 2).forEach((l, i) => {
          drawStyledLine(
            ctx,
            l,
            anchorX,
            captionY + 50 + i * 38,
            capFontPx,
            activeFontStack,
            config.textAlign,
            mutedTextColor,
            config.accentColor,
            isDarkPaper
          );
        });
      }
    } else {
      ctx.fillStyle = isDarkPaper ? 'rgba(255, 255, 255, 0.055)' : 'rgba(28, 25, 23, 0.035)';
      drawRoundedRect(ctx, photoX, photoY, photoW, photoH, config.cornerRadius);
      ctx.fill();

      const bodyFontPx = Math.round(35 * scale);
      const lineH = Math.round(54 * scale);
      const startY = photoY + photoH / 2 - (lines.length * lineH) / 2 + 24;
      const align = config.textAlign === 'left' ? 'left' : 'center';
      const drawX = align === 'left' ? photoX + 48 : photoX + photoW / 2;
      lines.forEach((line, idx) => {
        drawStyledLine(
          ctx,
          line,
          drawX,
          startY + idx * lineH,
          bodyFontPx,
          activeFontStack,
          align,
          config.textColor,
          config.accentColor,
          isDarkPaper
        );
      });

      const captionY = photoY + photoH + 64;
      ctx.textAlign = config.textAlign;
      const anchorX = config.textAlign === 'center' ? width / 2 : photoX;
      ctx.fillStyle = config.textColor;
      ctx.font = `600 ${Math.round(38 * scale)}px ${activeFontStack}`;
      ctx.fillText(
        safePageIdx > 0 ? `${config.customTitle}（續）` : config.customTitle,
        anchorX,
        captionY
      );
    }

    const stampY = cardY + cardH - 42;
    ctx.fillStyle = config.accentColor;
    ctx.font = `500 22px ${sansFont}`;
    ctx.textAlign = 'left';
    const leftStamp = [
      config.showDate && activeWork ? activeWork.createdAt.replace(/-/g, '.') : '',
      pageLabel,
    ]
      .filter(Boolean)
      .join(' · ');
    if (leftStamp) {
      ctx.fillText(leftStamp, photoX, stampY);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = mutedTextColor;
    if (config.showAuthor) {
      ctx.fillText(config.authorName, photoX + photoW, stampY);
    }
    return;
  }

  // TEMPLATES 1, 3, 4: EDITORIAL, DARKROOM, POSTCARD
  const isDarkroom = config.template === 'darkroom';
  const isPostcard = config.template === 'postcard';

  if (isDarkroom || config.template === 'editorial') {
    ctx.strokeStyle = hairlineColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pad * 0.55, pad * 0.55, width - pad * 1.1, height - pad * 1.1);
  }

  let cursorY = pad;

  if (isPostcard) {
    ctx.fillStyle = mutedTextColor;
    ctx.font = `500 22px ${sansFont}`;
    ctx.textAlign = 'left';
    ctx.fillText('FOLIO POSTCARD', pad, cursorY + 12);
    ctx.textAlign = 'right';
    const topRightText = [
      config.showDate && activeWork ? activeWork.createdAt : '',
      pageLabel,
    ]
      .filter(Boolean)
      .join(' · ');
    if (topRightText) {
      ctx.fillText(topRightText, width - pad, cursorY + 12);
    }
    ctx.strokeStyle = hairlineColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad, cursorY + 34);
    ctx.lineTo(width - pad, cursorY + 34);
    ctx.stroke();
    cursorY += 68;
  }

  const textAnchorX = config.textAlign === 'center' ? width / 2 : pad;
  const pageLines = pagination.horizontalPages[safePageIdx] || [];

  if (safePageIdx === 0) {
    if (loadedImg) {
      const imgMaxH = resolveSharePhotoBoxHeight(config, loadedImg, width, height, innerW);
      drawStyledPhoto(ctx, loadedImg, pad, cursorY, innerW, imgMaxH, config.cornerRadius, config, isDarkPaper, activeWork);
      cursorY += imgMaxH + 56;
    } else {
      cursorY += 36;
    }

    ctx.textAlign = config.textAlign;
    ctx.fillStyle = config.textColor;
    ctx.font = `600 ${Math.round(50 * scale)}px ${activeFontStack}`;
    const titleLines = wrapTextLines(ctx, config.customTitle, innerW).slice(0, 2);
    for (const tl of titleLines) {
      ctx.fillText(tl, textAnchorX, cursorY);
      cursorY += Math.round(62 * scale);
    }
    cursorY += 12;

    const quoteColor = isDarkPaper ? 'rgba(231, 229, 224, 0.86)' : 'rgba(28, 25, 23, 0.82)';
    const quoteFontPx = Math.round((loadedImg ? 29 : 36) * scale);
    const quoteLineH = Math.round(quoteFontPx * 1.65);
    for (const line of pageLines) {
      if (cursorY > height - pad - 108) break;
      drawStyledLine(
        ctx,
        line,
        textAnchorX,
        cursorY,
        quoteFontPx,
        activeFontStack,
        config.textAlign,
        quoteColor,
        config.accentColor,
        isDarkPaper
      );
      cursorY += line.isBlank ? Math.round(quoteLineH * 0.6) : quoteLineH;
    }
  } else {
    cursorY += 20;
    ctx.textAlign = config.textAlign;
    ctx.fillStyle = mutedTextColor;
    ctx.font = `500 ${Math.round(28 * scale)}px ${activeFontStack}`;
    ctx.fillText(`${config.customTitle}（${safePageIdx + 1}/${totalPages}）`, textAnchorX, cursorY);
    cursorY += Math.round(68 * scale);

    const quoteColor = isDarkPaper ? 'rgba(231, 229, 224, 0.88)' : 'rgba(28, 25, 23, 0.84)';
    const quoteFontPx = Math.round(36 * scale);
    const quoteLineH = Math.round(quoteFontPx * 1.65);
    for (const line of pageLines) {
      if (cursorY > height - pad - 108) break;
      drawStyledLine(
        ctx,
        line,
        textAnchorX,
        cursorY,
        quoteFontPx,
        activeFontStack,
        config.textAlign,
        quoteColor,
        config.accentColor,
        isDarkPaper
      );
      cursorY += line.isBlank ? Math.round(quoteLineH * 0.6) : quoteLineH;
    }
  }

  const footerY = height - pad;
  ctx.strokeStyle = hairlineColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad, footerY - 64);
  ctx.lineTo(width - pad, footerY - 64);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = mutedTextColor;
  ctx.font = `400 22px ${sansFont}`;

  const leftMeta = [
    config.showAuthor ? config.authorName : '',
    config.showDate && activeWork && !isPostcard ? activeWork.createdAt : '',
    !isPostcard && pageLabel ? pageLabel : '',
  ]
    .filter(Boolean)
    .join(' · ');
  ctx.fillText(leftMeta, pad, footerY - 18);

  if (config.showMeta && metaString) {
    ctx.textAlign = 'right';
    const rightX = config.showSeal ? width - pad - 60 : width - pad;
    ctx.fillText(metaString, rightX, footerY - 18);
  }

  drawSeal(width - pad - 44, footerY - 46, 44);
}

interface TemplateDraftCardProps {
  templateDef: (typeof TEMPLATES)[number];
  baseConfig: ShareConfig;
  activeWork: WorkItem | null;
  loadedImg: HTMLImageElement | null;
  dimensions: { width: number; height: number };
  fontTick: number;
  isSelected: boolean;
  conciseCopyMode?: boolean;
  onSelect: (tplId: ShareTemplateId) => void;
}

const TemplateDraftCard: React.FC<TemplateDraftCardProps> = ({
  templateDef,
  baseConfig,
  activeWork,
  loadedImg,
  dimensions,
  fontTick,
  isSelected,
  conciseCopyMode = false,
  onSelect,
}) => {
  const draftCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = draftCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previewScale = 0.36;
    canvas.width = Math.round(dimensions.width * previewScale);
    canvas.height = Math.round(dimensions.height * previewScale);

    const rawDraftConfig: ShareConfig = {
      ...baseConfig,
      template: templateDef.id,
      ...templateDef.defaults,
    };

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const autoScale = resolveAutoFlowScale(
      ctx,
      dimensions.width,
      dimensions.height,
      rawDraftConfig,
      loadedImg,
      'single'
    );
    const draftConfig: ShareConfig = { ...rawDraftConfig, fontSize: autoScale };
    const draftPagination = computeSharePagination(
      ctx,
      dimensions.width,
      dimensions.height,
      draftConfig,
      loadedImg
    );

    ctx.setTransform(previewScale, 0, 0, previewScale, 0, 0);
    drawShareCardPage(
      ctx,
      dimensions.width,
      dimensions.height,
      draftConfig,
      activeWork,
      loadedImg,
      {
        totalPages: draftPagination.totalPages,
        horizontalPages: [draftPagination.horizontalPages[0] || []],
        verticalPages: [draftPagination.verticalPages[0] || []],
        overflowsSinglePage: draftPagination.overflowsSinglePage,
      },
      0
    );
    ctx.restore();
  }, [templateDef, baseConfig, activeWork, loadedImg, dimensions, fontTick]);

  return (
    <button
      type="button"
      onClick={() => onSelect(templateDef.id)}
      className={`group text-left rounded-2xl border p-2.5 sm:p-3 transition-all flex flex-col bg-white dark:bg-[#191918] ${
        isSelected
          ? 'border-[#284152] dark:border-[#E7E5E0] ring-2 ring-[#284152]/20 dark:ring-[#E7E5E0]/20'
          : 'border-stone-200/90 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-600'
      }`}
    >
      <div className="w-full rounded-xl overflow-hidden bg-[#EFECE6] dark:bg-[#121211] flex items-center justify-center p-2">
        <canvas
          ref={draftCanvasRef}
          className="w-full h-auto max-h-[260px] object-contain rounded shadow-sm transition-transform duration-200 group-hover:scale-[1.015]"
        />
      </div>
      <div className="mt-2.5 px-0.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
            <span>{templateDef.label}</span>
          </div>
          {!conciseCopyMode && (
            <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 line-clamp-2 leading-relaxed">
              {templateDef.desc}
            </p>
          )}
        </div>
        {isSelected && (
          <span className="shrink-0 w-5 h-5 rounded-md bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 flex items-center justify-center mt-0.5">
            <Check className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    </button>
  );
};

interface DraftPreviewModalProps {
  open: boolean;
  onClose: () => void;
  config: ShareConfig;
  activeWork: WorkItem | null;
  loadedImg: HTMLImageElement | null;
  dimensions: { width: number; height: number };
  fontTick: number;
  conciseCopyMode?: boolean;
  onSelectTemplate: (tplId: ShareTemplateId) => void;
  onSelectFont: (fontId: ShareFontId) => void;
}

const DraftPreviewModal: React.FC<DraftPreviewModalProps> = ({
  open,
  onClose,
  config,
  activeWork,
  loadedImg,
  dimensions,
  fontTick,
  conciseCopyMode = false,
  onSelectTemplate,
  onSelectFont,
}) => {
  return (
    <BottomSheet
      isOpen={open}
      onClose={onClose}
      zIndexClass="z-[60]"
      backdropToneClass="bg-black/55"
      maxWidthClass="sm:max-w-5xl"
      panelClassName="max-h-[92vh] sm:max-h-[88vh] bg-[#F7F6F2] dark:bg-[#141413] rounded-t-3xl sm:rounded-3xl border border-stone-200 dark:border-stone-800 shadow-2xl flex flex-col overflow-hidden pb-safe"
    >
        <div className="px-4 sm:px-6 py-3.5 border-b border-stone-200/80 dark:border-stone-800 flex items-center justify-between gap-3 bg-white dark:bg-[#191918]">
          <div>
            <h3 className="font-editorial text-lg sm:text-xl font-semibold text-stone-900 dark:text-stone-100">
              多模板草稿預覽
            </h3>
            {!conciseCopyMode && (
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                同步套用目前標題、內文與字體，點選任一版型即可直接套用
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉草稿預覽"
            className="min-h-[40px] min-w-[40px] px-3 rounded-xl bg-stone-200/70 dark:bg-stone-800 text-stone-700 dark:text-stone-200 text-xs font-medium inline-flex items-center justify-center gap-1"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">關閉</span>
          </button>
        </div>

        {/* Quick Font Comparison Strip inside Draft Preview */}
        <div className="px-4 sm:px-6 py-2.5 border-b border-stone-200/60 dark:border-stone-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar bg-[#EFECE6]/50 dark:bg-[#181817]">
          <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400 shrink-0 inline-flex items-center gap-1">
            <Type className="w-3.5 h-3.5" />
            <span>預覽字體：</span>
          </span>
          {SHARE_FONTS.map((font) => {
            const active = config.fontFamily === font.id;
            return (
              <button
                key={font.id}
                type="button"
                onClick={() => onSelectFont(font.id)}
                className={`min-h-[34px] px-3 rounded-lg text-xs font-medium shrink-0 border transition-colors ${
                  active
                    ? 'bg-white dark:bg-[#242422] border-[#284152] dark:border-[#E7E5E0] text-stone-900 dark:text-stone-100 shadow-xs'
                    : 'bg-transparent border-stone-300/70 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-white/60 dark:hover:bg-stone-800/50'
                }`}
                style={{ fontFamily: font.stack }}
              >
                {font.shortLabel}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            {TEMPLATES.map((tpl) => (
              <TemplateDraftCard
                key={tpl.id}
                templateDef={tpl}
                baseConfig={config}
                activeWork={activeWork}
                loadedImg={loadedImg}
                dimensions={dimensions}
                fontTick={fontTick}
                isSelected={config.template === tpl.id}
                conciseCopyMode={conciseCopyMode}
                onSelect={(tplId) => {
                  onSelectTemplate(tplId);
                  onClose();
                }}
              />
            ))}
          </div>
        </div>
    </BottomSheet>
  );
};

function resolvePhotoFrameAspect(
  config: ShareConfig,
  img: HTMLImageElement,
  width: number,
  height: number
): number {
  const pad = config.padding;
  const innerW = width - pad * 2;
  if (config.template === 'polaroid') {
    const frameMargin = Math.round(pad * 0.85);
    const cardW = width - frameMargin * 2;
    const cardH = height - frameMargin * 2;
    const photoW = cardW - 96;
    const photoH = resolveSharePhotoBoxHeight(config, img, width, height, photoW, cardH);
    return photoW / Math.max(1, photoH);
  }
  const photoH = resolveSharePhotoBoxHeight(config, img, width, height, innerW);
  return innerW / Math.max(1, photoH);
}

interface InteractivePhotoCropperProps {
  imageSrc: string;
  imgNaturalW: number;
  imgNaturalH: number;
  frameAspect: number;
  photoFit: SharePhotoFit;
  zoom: number;
  offsetX: number;
  offsetY: number;
  conciseCopyMode?: boolean;
  onLiveCropChange?: (nextZoom: number, nextX: number, nextY: number) => void;
  onCommitCrop: (nextZoom: number, nextX: number, nextY: number) => void;
}

const InteractivePhotoCropper: React.FC<InteractivePhotoCropperProps> = ({
  imageSrc,
  imgNaturalW,
  imgNaturalH,
  frameAspect,
  photoFit,
  zoom,
  offsetX,
  offsetY,
  conciseCopyMode = false,
  onLiveCropChange,
  onCommitCrop,
}) => {
  const outerStageRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [liveCrop, setLiveCrop] = useState<{ zoom: number; x: number; y: number } | null>(null);
  const latestLiveRef = useRef<{ zoom: number; x: number; y: number } | null>(null);
  const lastEmitAtRef = useRef<number>(0);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef<{
    mode: 'drag' | 'pinch';
    startClientX: number;
    startClientY: number;
    startOffX: number;
    startOffY: number;
    startZoom: number;
    startPinchDist: number;
    stageW: number;
    stageH: number;
  } | null>(null);

  const safeBoxRatio = Math.max(0.35, Math.min(2.5, frameAspect));
  const imgRatio = imgNaturalH > 0 ? imgNaturalW / imgNaturalH : safeBoxRatio;

  const computeGeometry = (targetZoom: number, targetX: number, targetY: number) => {
    const clampedZoom = Math.max(1, Math.min(2.2, targetZoom));
    let baseW = safeBoxRatio;
    let baseH = 1;
    if (photoFit === 'contain') {
      if (imgRatio > safeBoxRatio) {
        baseW = safeBoxRatio;
        baseH = safeBoxRatio / imgRatio;
      } else {
        baseH = 1;
        baseW = imgRatio;
      }
    } else {
      if (imgRatio > safeBoxRatio) {
        baseH = 1;
        baseW = imgRatio;
      } else {
        baseW = safeBoxRatio;
        baseH = safeBoxRatio / imgRatio;
      }
    }

    const drawW = baseW * clampedZoom;
    const drawH = baseH * clampedZoom;
    const isPannableX = drawW > safeBoxRatio + 0.005;
    const isPannableY = drawH > 1 + 0.005;
    const slackRatioX = isPannableX ? (drawW - safeBoxRatio) / (2 * safeBoxRatio) : 0;
    const slackRatioY = isPannableY ? (drawH - 1) / 2 : 0;

    return {
      clampedZoom,
      drawW,
      drawH,
      isPannableX,
      isPannableY,
      isPannable: isPannableX || isPannableY,
      slackRatioX,
      slackRatioY,
      widthPct: (drawW / safeBoxRatio) * 100,
      heightPct: drawH * 100,
      leftPct: isPannableX
        ? -slackRatioX * (1 + targetX / 100) * 100
        : ((safeBoxRatio - drawW) / (2 * safeBoxRatio)) * 100,
      topPct: isPannableY
        ? -slackRatioY * (1 + targetY / 100) * 100
        : ((1 - drawH) / 2) * 100,
    };
  };

  const emitLiveCrop = (nextZoom: number, nextX: number, nextY: number, force = false) => {
    if (!onLiveCropChange) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!force && now - lastEmitAtRef.current < 32) return;
    lastEmitAtRef.current = now;
    onLiveCropChange(
      Number(Math.max(1, Math.min(2.2, nextZoom)).toFixed(2)),
      Math.round(nextX),
      Math.round(nextY)
    );
  };

  const activeZoom = liveCrop ? liveCrop.zoom : zoom;
  const activeOffX = liveCrop ? liveCrop.x : offsetX;
  const activeOffY = liveCrop ? liveCrop.y : offsetY;
  const geom = computeGeometry(activeZoom, activeOffX, activeOffY);

  // Support trackpad pinch & mouse wheel zoom cleanly without scrolling parent container
  const wheelStateRef = useRef({ zoom, offsetX, offsetY, onCommitCrop, onLiveCropChange });
  wheelStateRef.current = { zoom, offsetX, offsetY, onCommitCrop, onLiveCropChange };

  useEffect(() => {
    const el = outerStageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 0.5) return;
      e.preventDefault();
      const { zoom: curZ, offsetX: curX, offsetY: curY, onCommitCrop: commit, onLiveCropChange: liveFn } =
        wheelStateRef.current;
      const step = -e.deltaY * 0.0025;
      const nextZoom = Number(Math.max(1, Math.min(2.2, curZ + step)).toFixed(2));
      if (nextZoom !== curZ) {
        liveFn?.(nextZoom, curX, curY);
        commit(nextZoom, curX, curY);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const startGestureFromPointers = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const current = latestLiveRef.current || { zoom, x: offsetX, y: offsetY };
    const pts = Array.from(pointersRef.current.values());

    if (pts.length >= 2) {
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      gestureRef.current = {
        mode: 'pinch',
        startClientX: midX,
        startClientY: midY,
        startOffX: current.x,
        startOffY: current.y,
        startZoom: current.zoom,
        startPinchDist: Math.max(10, dist),
        stageW: rect.width,
        stageH: rect.height,
      };
    } else if (pts.length === 1) {
      gestureRef.current = {
        mode: 'drag',
        startClientX: pts[0].x,
        startClientY: pts[0].y,
        startOffX: current.x,
        startOffY: current.y,
        startZoom: current.zoom,
        startPinchDist: 0,
        stageW: rect.width,
        stageH: rect.height,
      };
    } else {
      gestureRef.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore capture errors on secondary pointers in some mobile WebViews
    }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!latestLiveRef.current) {
      latestLiveRef.current = { zoom, x: offsetX, y: offsetY };
      setLiveCrop(latestLiveRef.current);
    }
    startGestureFromPointers();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gestureRef.current;
    if (!g) return;
    e.preventDefault();

    const pts = Array.from(pointersRef.current.values());
    let nextZoom = g.startZoom;
    let dx = 0;
    let dy = 0;

    if (g.mode === 'pinch' && pts.length >= 2) {
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      nextZoom = Math.max(1, Math.min(2.2, g.startZoom * (dist / g.startPinchDist)));
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      dx = midX - g.startClientX;
      dy = midY - g.startClientY;
    } else if (pts.length >= 1) {
      dx = pts[0].x - g.startClientX;
      dy = pts[0].y - g.startClientY;
    }

    const nextGeom = computeGeometry(nextZoom, g.startOffX, g.startOffY);
    const nextX =
      nextGeom.slackRatioX > 0.001
        ? Math.max(
            -100,
            Math.min(100, g.startOffX - ((dx / g.stageW) * 100) / nextGeom.slackRatioX)
          )
        : g.startOffX;
    const nextY =
      nextGeom.slackRatioY > 0.001
        ? Math.max(
            -100,
            Math.min(100, g.startOffY - ((dy / g.stageH) * 100) / nextGeom.slackRatioY)
          )
        : g.startOffY;

    const updated = {
      zoom: Number(nextGeom.clampedZoom.toFixed(2)),
      x: nextX,
      y: nextY,
    };
    latestLiveRef.current = updated;
    setLiveCrop(updated);
    emitLiveCrop(updated.zoom, updated.x, updated.y);
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore release errors
    }
    pointersRef.current.delete(e.pointerId);

    if (pointersRef.current.size > 0) {
      startGestureFromPointers();
      return;
    }

    const finalState = latestLiveRef.current;
    gestureRef.current = null;
    latestLiveRef.current = null;
    setLiveCrop(null);
    if (finalState) {
      const committedZoom = Number(Math.max(1, Math.min(2.2, finalState.zoom)).toFixed(2));
      const committedX = Math.round(finalState.x);
      const committedY = Math.round(finalState.y);
      emitLiveCrop(committedZoom, committedX, committedY, true);
      onCommitCrop(committedZoom, committedX, committedY);
    }
  };

  const adjustZoomBy = (delta: number) => {
    const nextZoom = Number(Math.max(1, Math.min(2.2, zoom + delta)).toFixed(2));
    emitLiveCrop(nextZoom, offsetX, offsetY, true);
    onCommitCrop(nextZoom, offsetX, offsetY);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2 text-[11px] text-stone-500 dark:text-stone-400">
        <span className="inline-flex items-center gap-1 font-medium text-stone-700 dark:text-stone-300">
          <Move className="w-3.5 h-3.5 shrink-0" />
          <span>
            {conciseCopyMode
              ? '雙指縮放 / 拖曳調整範圍'
              : geom.isPannable
              ? '雙指縮放、滾輪或拖曳移動，半透明遮罩外將不顯示於圖卡'
              : '雙指捏合放大或調整倍率，左側圖卡會同步即時預覽裁切效果'}
          </span>
        </span>
        {(zoom !== 1 || offsetX !== 0 || offsetY !== 0) && (
          <button
            type="button"
            onClick={() => {
              emitLiveCrop(1, 0, 0, true);
              onCommitCrop(1, 0, 0);
            }}
            className="text-[11px] font-medium text-[#284152] dark:text-stone-300 hover:underline shrink-0"
          >
            重設置中
          </button>
        )}
      </div>

      {/* Viewfinder Stage: full preview image below + semi-transparent dark overlay mask around final crop frame */}
      <div
        ref={outerStageRef}
        data-no-swipe="true"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className={`relative w-full rounded-xl bg-[#141412] p-5 sm:p-6 overflow-hidden flex items-center justify-center select-none touch-none ${
          geom.isPannable
            ? liveCrop
              ? 'cursor-grabbing'
              : 'cursor-grab'
            : 'cursor-zoom-in'
        }`}
      >
        <div
          ref={stageRef}
          className="relative w-full max-w-[230px] max-h-[190px]"
          style={{ aspectRatio: `${safeBoxRatio}` }}
        >
          {/* Underlying Full Preview Image (moves & scales seamlessly behind the overlay aperture) */}
          <img
            src={imageSrc}
            alt="裁切取景預覽"
            draggable={false}
            className="pointer-events-none select-none will-change-transform"
            style={{
              position: 'absolute',
              left: `${geom.leftPct}%`,
              top: `${geom.topPct}%`,
              width: `${geom.widthPct}%`,
              height: `${geom.heightPct}%`,
              maxWidth: 'none',
            }}
          />

          {/* Semi-Transparent Mask Overlay (dims everything outside the exact final share card crop bounds) */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 rounded-lg transition-shadow ${
              liveCrop
                ? 'ring-2 ring-white shadow-[0_0_0_9999px_rgba(14,14,13,0.68)]'
                : 'ring-2 ring-white/90 shadow-[0_0_0_9999px_rgba(14,14,13,0.58)]'
            }`}
          >
            {/* Rule of thirds guide grid */}
            <div className="absolute inset-0 opacity-75">
              <div className="absolute inset-x-0 top-1/3 h-px bg-white/30" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-white/30" />
              <div className="absolute inset-y-0 left-1/3 w-px bg-white/30" />
              <div className="absolute inset-y-0 left-2/3 w-px bg-white/30" />
            </div>

            {/* Corner crop marks */}
            <div className="absolute inset-1.5">
              <span className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-white rounded-tl-[2px]" />
              <span className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-white rounded-tr-[2px]" />
              <span className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-white rounded-bl-[2px]" />
              <span className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-white rounded-br-[2px]" />
            </div>

            <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/55 backdrop-blur-[2px] text-[9px] tracking-wide text-white/95">
              最終顯示範圍
            </div>

            <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/65 backdrop-blur-[2px] text-[10px] text-white tabular-nums">
              {geom.clampedZoom.toFixed(2)}x
            </div>
          </div>
        </div>
      </div>

      {/* Integrated Visual Zoom Bar */}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={() => adjustZoomBy(-0.1)}
          disabled={activeZoom <= 1}
          aria-label="縮小裁切範圍"
          className="min-h-[34px] min-w-[34px] rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#191918] text-stone-700 dark:text-stone-200 flex items-center justify-center disabled:opacity-40 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <input
          type="range"
          min="1"
          max="2.2"
          step="0.05"
          aria-label="縮放倍率"
          value={geom.clampedZoom}
          onChange={(e) => {
            const nextZ = Number(e.target.value);
            emitLiveCrop(nextZ, offsetX, offsetY, true);
            onCommitCrop(nextZ, offsetX, offsetY);
          }}
          className="flex-1 accent-[#284152]"
        />
        <button
          type="button"
          onClick={() => adjustZoomBy(0.1)}
          disabled={activeZoom >= 2.2}
          aria-label="放大裁切範圍"
          className="min-h-[34px] min-w-[34px] rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#191918] text-stone-700 dark:text-stone-200 flex items-center justify-center disabled:opacity-40 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <span className="text-[11px] font-medium tabular-nums text-stone-600 dark:text-stone-300 min-w-[38px] text-right">
          {geom.clampedZoom.toFixed(2)}x
        </span>
      </div>
    </div>
  );
};

export const ShareCardStudio: React.FC<ShareCardStudioProps> = ({
  works,
  collections,
  initialWork,
  authorName,
  sealText,
  conciseCopyMode = false,
  savedTemplates = [],
  defaultTemplateId = '',
  onSaveCustomTemplate,
  onDeleteCustomTemplate,
  onSetDefaultTemplate,
  onClose,
  isModal = false,
}) => {
  const { animationOverhaul } = useMotionPreferences();
  useBodyScrollLock(Boolean(isModal));

  const unlockedWorks = useMemo(
    () => works.filter((w) => !(w.isPrivate && w.isSealed)),
    [works]
  );

  // Step 1 filters: WorkType + Collection
  const [filterType, setFilterType] = useState<'all' | WorkType>(
    initialWork ? initialWork.type : 'all'
  );
  const [filterCollectionId, setFilterCollectionId] = useState<string>(
    initialWork
      ? initialWork.collectionId && collections.some((c) => c.id === initialWork.collectionId)
        ? initialWork.collectionId
        : '__none__'
      : 'all'
  );

  const filteredWorks = useMemo(() => {
    return unlockedWorks.filter((w) => {
      if (filterType !== 'all' && w.type !== filterType) return false;
      if (filterCollectionId === '__none__') {
        if (w.collectionId && collections.some((c) => c.id === w.collectionId)) return false;
      } else if (filterCollectionId !== 'all' && w.collectionId !== filterCollectionId) {
        return false;
      }
      return true;
    });
  }, [unlockedWorks, filterType, filterCollectionId, collections]);

  const [selectedWorkId, setSelectedWorkId] = useState<string>(
    initialWork?.id || unlockedWorks[0]?.id || ''
  );

  useEffect(() => {
    if (filteredWorks.length === 0) return;
    const stillVisible = filteredWorks.some((w) => w.id === selectedWorkId);
    if (!stillVisible) {
      setSelectedWorkId(filteredWorks[0].id);
    }
  }, [filteredWorks, selectedWorkId]);

  const activeWork = useMemo(
    () => filteredWorks.find((w) => w.id === selectedWorkId) || filteredWorks[0] || null,
    [filteredWorks, selectedWorkId]
  );

  // Long-text sharing controls: chapter selection, single vs multi-image pagination, quote segment picker, & per-page manual assignment
  const [shareMode, setShareMode] = useState<'single' | 'multi'>('single');
  const [selectedChapterIdx, setSelectedChapterIdx] = useState<'all' | number>('all');
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [showSegmentPicker, setShowSegmentPicker] = useState(false);
  const [segmentSplitMode, setSegmentSplitMode] = useState<'paragraph' | 'sentence'>('paragraph');
  const [selectedSegmentIndices, setSelectedSegmentIndices] = useState<number[]>([]);
  const [manualPages, setManualPages] = useState<string[][] | null>(null);
  const [manualUnitMode, setManualUnitMode] = useState<'paragraph' | 'sentence'>('sentence');
  const [showPageAssigner, setShowPageAssigner] = useState(false);

  const sourceFullText = useMemo(() => {
    if (!activeWork) return '';
    if (activeWork.chapters && activeWork.chapters.length > 0) {
      if (selectedChapterIdx === 'all') {
        return activeWork.chapters
          .map((ch) => `${ch.title}\n${ch.content}`)
          .join('\n\n');
      }
      const ch = activeWork.chapters[selectedChapterIdx];
      return ch ? ch.content : activeWork.content || '';
    }
    return activeWork.content || activeWork.subtitle || '';
  }, [activeWork, selectedChapterIdx]);

  const selectableSegments = useMemo(() => {
    if (!sourceFullText.trim()) return [];
    if (segmentSplitMode === 'paragraph') {
      return sourceFullText
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return sourceFullText
      .split(/(?<=[。！？!?；;\n])/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [sourceFullText, segmentSplitMode]);

  const defaultPreset = useMemo(
    () => savedTemplates.find((t) => t.id === defaultTemplateId) || null,
    [savedTemplates, defaultTemplateId]
  );

  const [config, setConfig] = useState<ShareConfig>(() => ({
    template: defaultPreset?.config.template || 'editorial',
    ratio: defaultPreset?.config.ratio || '3:4',
    fontFamily: defaultPreset?.config.fontFamily || 'editorial',
    paperColor: defaultPreset?.config.paperColor || '#F7F6F2',
    textColor: defaultPreset?.config.textColor || '#1C1917',
    accentColor: defaultPreset?.config.accentColor || '#9E3B33',
    textAlign: defaultPreset?.config.textAlign || 'left',
    fontSize: defaultPreset?.config.fontSize ?? 1,
    padding: defaultPreset?.config.padding ?? 84,
    cornerRadius: defaultPreset?.config.cornerRadius ?? 8,
    showDate: defaultPreset?.config.showDate ?? true,
    showMeta: defaultPreset?.config.showMeta ?? true,
    showAuthor: defaultPreset?.config.showAuthor ?? true,
    showSeal: defaultPreset?.config.showSeal ?? true,
    autoFlowLayout: defaultPreset?.config.autoFlowLayout ?? false,
    useMarkdown: defaultPreset?.config.useMarkdown ?? true,
    photoFit: defaultPreset?.config.photoFit || 'contain',
    photoAspect: defaultPreset?.config.photoAspect || 'original',
    photoFrameStyle: defaultPreset?.config.photoFrameStyle || 'none',
    photoZoom: defaultPreset?.config.photoZoom ?? 1,
    photoOffsetX: defaultPreset?.config.photoOffsetX ?? 0,
    photoOffsetY: defaultPreset?.config.photoOffsetY ?? 0,
    authorName: authorName || '林硯',
    sealText: (sealText || '硯').slice(0, 1),
    customTitle: initialWork?.title || unlockedWorks[0]?.title || '拾光剪影',
    customQuote:
      (initialWork?.content || unlockedWorks[0]?.content || '')
        .split('\n')
        .slice(0, 5)
        .join('\n') || '在字句與光影之間，保存安靜的片刻。',
  }));

  const [activeSavedTemplateId, setActiveSavedTemplateId] = useState<string>(
    defaultPreset?.id || ''
  );
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [saveAsDefaultTpl, setSaveAsDefaultTpl] = useState(true);
  const [savingTpl, setSavingTpl] = useState(false);
  const [templateNotice, setTemplateNotice] = useState('');
  const noticeTimerRef = useRef<number | null>(null);
  const prevWorkIdRef = useRef<string | undefined>(activeWork?.id);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  // Reset chapter, manual pages & per-photo crop pan/zoom when actively switching to another work
  useEffect(() => {
    setSelectedChapterIdx('all');
    setSelectedSegmentIndices([]);
    setShowSegmentPicker(false);
    setManualPages(null);
    setShowPageAssigner(false);
    setCurrentPageIdx(0);
    setLiveCropOverride(null);
    if (prevWorkIdRef.current !== activeWork?.id) {
      prevWorkIdRef.current = activeWork?.id;
      setConfig((prev) => ({
        ...prev,
        photoZoom: 1,
        photoOffsetX: 0,
        photoOffsetY: 0,
      }));
    }
  }, [activeWork?.id]);

  // Sync title & text whenever work, chapter, or shareMode changes
  useEffect(() => {
    if (!activeWork) return;
    const chTitle =
      activeWork.chapters &&
      activeWork.chapters.length > 0 &&
      selectedChapterIdx !== 'all'
        ? activeWork.chapters[selectedChapterIdx]?.title
        : undefined;

    const fullText = sourceFullText;
    const nextQuote =
      shareMode === 'multi'
        ? fullText
        : fullText.split('\n').slice(0, 5).join('\n');

    setConfig((prev) => ({
      ...prev,
      customTitle: chTitle ? `${activeWork.title} · ${chTitle}` : activeWork.title,
      customQuote: nextQuote,
    }));
    setSelectedSegmentIndices([]);
    setManualPages(null);
    if (shareMode !== 'multi') {
      setShowPageAssigner(false);
    }
    setCurrentPageIdx(0);
  }, [activeWork, selectedChapterIdx, sourceFullText, shareMode]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const deferredConfig = useDeferredValue(config);
  const [liveCropOverride, setLiveCropOverride] = useState<{
    photoZoom: number;
    photoOffsetX: number;
    photoOffsetY: number;
  } | null>(null);
  const { activeTask, runPriorityCardExport } = useExportQueue();
  const [loadedImg, setLoadedImg] = useState<HTMLImageElement | null>(null);
  const [exportStatus, setExportStatus] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [fontTick, setFontTick] = useState(0);
  const [studioMode, setStudioMode] = useState<'simple' | 'detailed'>('simple');
  const [showDraftPreview, setShowDraftPreview] = useState(false);
  const cropSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeWork || activeWork.type !== 'photography' || !activeWork.imageData) {
      setLoadedImg(null);
      return;
    }
    const img = new Image();
    img.onload = () => setLoadedImg(img);
    img.onerror = () => setLoadedImg(null);
    img.src = activeWork.imageData;
  }, [activeWork]);

  useEffect(() => {
    const fontDef =
      SHARE_FONTS.find((f) => f.id === config.fontFamily) || SHARE_FONTS[0];
    const sampleText = `${config.customTitle}${config.customQuote}${config.authorName}${config.sealText}`;
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      if (!document.fonts?.load) return;
      try {
        await Promise.all(
          fontDef.preloadNames.flatMap((name) => [
            document.fonts.load(`400 36px "${name}"`, sampleText),
            document.fonts.load(`700 36px "${name}"`, sampleText),
          ])
        );
        if (!cancelled) {
          setFontTick((n) => n + 1);
        }
      } catch {
        // Fallback fonts render cleanly
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    config.fontFamily,
    config.customTitle,
    config.customQuote,
    config.authorName,
    config.sealText,
  ]);

  const dimensions = useMemo(() => {
    if (deferredConfig.ratio === '1:1') return { width: 1080, height: 1080 };
    if (deferredConfig.ratio === '9:16') return { width: 1080, height: 1920 };
    return { width: 1080, height: 1440 };
  }, [deferredConfig.ratio]);

  // Compute Auto-Flow scale, current pagination, and full-source page count
  const { effectiveConfig, pagination, fullTextPageCount } = useMemo(() => {
    if (!measureCanvasRef.current && typeof document !== 'undefined') {
      measureCanvasRef.current = document.createElement('canvas');
    }
    const ctx = measureCanvasRef.current?.getContext('2d') || null;
    if (!ctx) {
      return {
        effectiveConfig: deferredConfig,
        pagination: {
          totalPages: 1,
          horizontalPages: [[]],
          verticalPages: [[]],
          overflowsSinglePage: false,
        },
        fullTextPageCount: 1,
      };
    }

    const resolvedScale = resolveAutoFlowScale(
      ctx,
      dimensions.width,
      dimensions.height,
      deferredConfig,
      loadedImg,
      shareMode
    );
    const nextEffConfig: ShareConfig = { ...deferredConfig, fontSize: resolvedScale };

    const activeManualPages = shareMode === 'multi' ? manualPages : null;

    const currentPagination = computeSharePagination(
      ctx,
      dimensions.width,
      dimensions.height,
      nextEffConfig,
      loadedImg,
      activeManualPages
    );
    const fullPagination =
      sourceFullText && sourceFullText !== deferredConfig.customQuote
        ? computeSharePagination(
            ctx,
            dimensions.width,
            dimensions.height,
            { ...nextEffConfig, customQuote: sourceFullText },
            loadedImg
          )
        : currentPagination;

    return {
      effectiveConfig: nextEffConfig,
      pagination: currentPagination,
      fullTextPageCount: activeManualPages
        ? currentPagination.totalPages
        : fullPagination.totalPages,
    };
  }, [
    deferredConfig,
    dimensions,
    loadedImg,
    sourceFullText,
    shareMode,
    fontTick,
    manualPages,
  ]);

  useEffect(() => {
    if (currentPageIdx >= pagination.totalPages) {
      setCurrentPageIdx(Math.max(0, pagination.totalPages - 1));
    }
  }, [pagination.totalPages, currentPageIdx]);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;
    canvas.width = width;
    canvas.height = height;

    const effectivePagination: ComputedPagination =
      shareMode === 'single'
        ? {
            totalPages: 1,
            horizontalPages: [pagination.horizontalPages[0] || []],
            verticalPages: [pagination.verticalPages[0] || []],
            overflowsSinglePage: pagination.overflowsSinglePage,
          }
        : pagination;

    const pageToRender = shareMode === 'single' ? 0 : currentPageIdx;
    const liveConfig: ShareConfig = liveCropOverride
      ? {
          ...effectiveConfig,
          photoZoom: liveCropOverride.photoZoom,
          photoOffsetX: liveCropOverride.photoOffsetX,
          photoOffsetY: liveCropOverride.photoOffsetY,
        }
      : effectiveConfig;

    drawShareCardPage(
      ctx,
      width,
      height,
      liveConfig,
      activeWork,
      loadedImg,
      effectivePagination,
      pageToRender
    );
  }, [
    activeWork,
    effectiveConfig,
    liveCropOverride,
    dimensions,
    loadedImg,
    pagination,
    currentPageIdx,
    shareMode,
    fontTick,
  ]);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      renderCanvas();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [renderCanvas]);

  const applyTemplate = (tplId: ShareTemplateId) => {
    const found = TEMPLATES.find((t) => t.id === tplId);
    if (!found) return;
    setActiveSavedTemplateId('');
    setConfig((prev) => ({
      ...prev,
      template: tplId,
      ...found.defaults,
    }));
  };

  const applySavedTemplate = (tpl: SavedShareTemplate) => {
    setActiveSavedTemplateId(tpl.id);
    setConfig((prev) => ({
      ...prev,
      ...tpl.config,
    }));
  };

  const handleSavePresetTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveCustomTemplate) return;
    const trimmed = saveTemplateName.trim();
    if (!trimmed) return;
    setSavingTpl(true);
    try {
      const {
        authorName: _a,
        sealText: _s,
        customTitle: _t,
        customQuote: _q,
        ...layoutOnly
      } = config;
      const newTpl: SavedShareTemplate = {
        id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: trimmed,
        createdAt: Date.now(),
        config: layoutOnly,
      };
      await onSaveCustomTemplate(newTpl, saveAsDefaultTpl);
      setActiveSavedTemplateId(newTpl.id);
      setSaveTemplateName('');
      setSaveTemplateOpen(false);
      setTemplateNotice(
        saveAsDefaultTpl
          ? `已儲存「${newTpl.name}」並設為預設模版`
          : `已儲存自訂模版「${newTpl.name}」`
      );
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
      noticeTimerRef.current = window.setTimeout(() => setTemplateNotice(''), 3000);
    } finally {
      setSavingTpl(false);
    }
  };

  const allSegmentsSelected =
    selectableSegments.length > 0 &&
    selectedSegmentIndices.length === selectableSegments.length;

  const toggleSegment = (index: number) => {
    const next = selectedSegmentIndices.includes(index)
      ? selectedSegmentIndices.filter((i) => i !== index)
      : [...selectedSegmentIndices, index].sort((a, b) => a - b);

    setSelectedSegmentIndices(next);
    setManualPages(null);
    if (next.length > 0) {
      const joined = next.map((i) => selectableSegments[i]).join('\n');
      setConfig((prev) => ({ ...prev, customQuote: joined }));
      setCurrentPageIdx(0);
    }
  };

  const handleToggleSelectAllSegments = () => {
    if (selectableSegments.length === 0) return;
    setManualPages(null);
    setCurrentPageIdx(0);
    if (allSegmentsSelected) {
      setSelectedSegmentIndices([]);
      const fallback =
        shareMode === 'multi'
          ? sourceFullText
          : sourceFullText.split('\n').slice(0, 5).join('\n');
      setConfig((prev) => ({ ...prev, customQuote: fallback }));
      return;
    }
    const allIndices = selectableSegments.map((_, i) => i);
    const joined = selectableSegments.join('\n');
    setSelectedSegmentIndices(allIndices);
    setConfig((prev) => ({ ...prev, customQuote: joined }));
  };

  const applyManualPagesUpdate = (rawPages: string[][], focusPage?: number) => {
    const cleaned = rawPages.filter((p) => p.length > 0);
    const finalPages = cleaned.length > 0 ? cleaned : [[]];
    setManualPages(finalPages);
    setConfig((prev) => ({
      ...prev,
      customQuote: finalPages.map((p) => p.join('\n')).join('\n\n'),
    }));
    if (focusPage !== undefined) {
      setCurrentPageIdx(Math.max(0, Math.min(focusPage, finalPages.length - 1)));
    }
  };

  const initOrRepackManualPages = (modeOverride?: 'paragraph' | 'sentence') => {
    const unitMode = modeOverride ?? manualUnitMode;
    if (modeOverride) setManualUnitMode(modeOverride);

    const units = splitTextIntoPaginationUnits(
      config.customQuote.trim() || sourceFullText,
      unitMode
    );
    if (!measureCanvasRef.current && typeof document !== 'undefined') {
      measureCanvasRef.current = document.createElement('canvas');
    }
    const ctx = measureCanvasRef.current?.getContext('2d') || null;
    if (!ctx || units.length === 0) {
      applyManualPagesUpdate(units.length > 0 ? [units] : [[]], 0);
      setShowPageAssigner(true);
      return;
    }

    const packed = packUnitsWithoutSplitting(
      ctx,
      dimensions.width,
      dimensions.height,
      effectiveConfig,
      loadedImg,
      units
    );
    applyManualPagesUpdate(packed, 0);
    setShowPageAssigner(true);
  };

  const moveUnitToPrevPage = (pageIdx: number) => {
    if (!manualPages || pageIdx <= 0) return;
    const src = [...manualPages[pageIdx]];
    const first = src.shift();
    if (!first) return;
    const next = manualPages.map((p, idx) => {
      if (idx === pageIdx - 1) return [...p, first];
      if (idx === pageIdx) return src;
      return [...p];
    });
    applyManualPagesUpdate(next, pageIdx - 1);
  };

  const moveUnitToNextPage = (pageIdx: number) => {
    if (!manualPages) return;
    const src = [...manualPages[pageIdx]];
    const last = src.pop();
    if (!last) return;
    const next = manualPages.map((p, idx) => (idx === pageIdx ? src : [...p]));
    if (pageIdx + 1 < next.length) {
      next[pageIdx + 1] = [last, ...next[pageIdx + 1]];
    } else {
      next.push([last]);
    }
    applyManualPagesUpdate(next, Math.min(pageIdx + 1, next.length - 1));
  };

  const splitPageAfterUnit = (pageIdx: number, unitIdx: number) => {
    if (!manualPages) return;
    const src = manualPages[pageIdx];
    if (unitIdx < 0 || unitIdx >= src.length - 1) return;
    const head = src.slice(0, unitIdx + 1);
    const tail = src.slice(unitIdx + 1);
    const next = [...manualPages];
    next.splice(pageIdx, 1, head, tail);
    applyManualPagesUpdate(next, pageIdx + 1);
  };

  const mergePageWithNext = (pageIdx: number) => {
    if (!manualPages || pageIdx >= manualPages.length - 1) return;
    const merged = [...manualPages[pageIdx], ...manualPages[pageIdx + 1]];
    const next = [...manualPages];
    next.splice(pageIdx, 2, merged);
    applyManualPagesUpdate(next, pageIdx);
  };

  const handleExport = async () => {
    setExporting(true);
    setExportStatus('');
    const hadBackgroundExport = Boolean(activeTask);
    try {
      const msg = await runPriorityCardExport(async () => {
        if (shareMode === 'multi' && pagination.totalPages > 1) {
          const offscreen = document.createElement('canvas');
          offscreen.width = dimensions.width;
          offscreen.height = dimensions.height;
          try {
            const ctx = offscreen.getContext('2d');
            if (!ctx) throw new Error('無法建立繪圖畫布');

            const dataUrls: string[] = [];
            for (let p = 0; p < pagination.totalPages; p++) {
              drawShareCardPage(
                ctx,
                dimensions.width,
                dimensions.height,
                effectiveConfig,
                activeWork,
                loadedImg,
                pagination,
                p
              );
              dataUrls.push(offscreen.toDataURL('image/png', 1.0));
              if (p < pagination.totalPages - 1) {
                await new Promise<void>((r) => window.setTimeout(r, 0));
              }
            }
            return saveOrShareMultipleImages(dataUrls, effectiveConfig.customTitle);
          } finally {
            offscreen.width = 0;
            offscreen.height = 0;
          }
        }

        const canvas = canvasRef.current;
        if (!canvas) throw new Error('畫布尚未就緒');
        const dataUrl = canvas.toDataURL('image/png', 1.0);
        return saveOrShareGeneratedImage(dataUrl, effectiveConfig.customTitle);
      }, activeWork?.title);

      setExportStatus(
        hadBackgroundExport
          ? `${msg}（已高優先輸出單篇圖卡，背景佇列將自動接續完成）`
          : msg
      );
    } catch (err) {
      setExportStatus(err instanceof Error ? err.message : '匯出失敗');
    } finally {
      setExporting(false);
    }
  };

  const exportButtonText =
    shareMode === 'multi' && pagination.totalPages > 1
      ? `直接儲存全部 ${pagination.totalPages} 張圖卡`
      : '直接儲存 PNG 圖卡';

  return (
    <div
      className={
        isModal
          ? 'fixed inset-0 z-50 bg-[#F7F6F2] dark:bg-[#111110] flex flex-col overflow-hidden'
          : 'max-w-6xl mx-auto'
      }
    >
      {isModal && (
        <header className="pt-safe shrink-0 border-b border-stone-200/80 dark:border-stone-800 bg-[#F7F6F2] dark:bg-[#111110]">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-2 -ml-2 flex items-center gap-1.5 text-sm font-medium text-stone-700 dark:text-stone-300"
            >
              <X className="w-5 h-5" />
              <span>關閉圖卡工作室</span>
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="min-h-[40px] px-4 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium inline-flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>
                {exporting
                  ? '儲存中...'
                  : shareMode === 'multi' && pagination.totalPages > 1
                  ? `儲存 ${pagination.totalPages} 張 PNG`
                  : '直接儲存 PNG'}
              </span>
            </button>
          </div>
        </header>
      )}

      <div className={`flex-1 overflow-y-auto ${isModal ? 'overscroll-contain p-4 sm:p-6 pb-safe' : ''}`}>
        {!isModal && (
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-stone-200/80 dark:border-stone-800 pb-5 mb-4">
            <div>
              <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100">
                分享圖卡工作室
              </h2>
              {!conciseCopyMode && (
                <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
                  支援單張精選節錄與長文多圖自動分頁生成，可挑選特定段落或手寫字體排版。
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="min-h-[44px] px-5 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium inline-flex items-center gap-2 self-start sm:self-auto hover:opacity-90 transition-opacity"
            >
              <Download className="w-4 h-4" />
              <span>{exporting ? '輸出高畫質圖檔...' : exportButtonText}</span>
            </button>
          </div>
        )}

        {/* Prominent Top Mode Switcher (Directly below Title & Export Button) */}
        <div className="max-w-6xl mx-auto mb-5 p-2 rounded-2xl bg-[#EFECE6]/90 dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="px-2 flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[#284152] dark:text-[#E7E5E0] shrink-0" />
            <div>
              <div className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                編輯模式：{studioMode === 'simple' ? '簡單模式' : '詳細模式'}
              </div>
              {!conciseCopyMode && (
                <div className="text-[11px] text-stone-500 dark:text-stone-400">
                  {studioMode === 'simple'
                    ? '保留常用功能，選取作品後快速套版分享'
                    : '解鎖自動流式佈局、Markdown 語法、自訂預設模版與排版微調'}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white/75 dark:bg-[#111110] border border-stone-200/60 dark:border-stone-800 shrink-0">
            <button
              type="button"
              onClick={() => setStudioMode('simple')}
              className={`relative min-h-[40px] px-5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center ${
                studioMode === 'simple'
                  ? 'text-white dark:text-stone-900'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
              }`}
            >
              {studioMode === 'simple' && (
                <SlidingPill
                  layoutId="studio-mode-pill"
                  className="bg-[#284152] dark:bg-[#E7E5E0] shadow-sm rounded-lg"
                />
              )}
              <span className="relative z-10">簡單模式</span>
            </button>
            <button
              type="button"
              onClick={() => setStudioMode('detailed')}
              className={`relative min-h-[40px] px-5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center ${
                studioMode === 'detailed'
                  ? 'text-white dark:text-stone-900'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
              }`}
            >
              {studioMode === 'detailed' && (
                <SlidingPill
                  layoutId="studio-mode-pill"
                  className="bg-[#284152] dark:bg-[#E7E5E0] shadow-sm rounded-lg"
                />
              )}
              <span className="relative z-10">詳細模式</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start max-w-6xl mx-auto">
          {/* Left: Live High-DPI Canvas Preview + Page Navigator */}
          <div className="lg:col-span-6 flex flex-col items-center space-y-3">
            <div className="w-full max-w-[420px] rounded-2xl bg-[#EFECE6] dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 p-4 sm:p-5 flex items-center justify-center">
              <canvas
                ref={canvasRef}
                className="w-full h-auto max-h-[58vh] object-contain rounded-lg shadow-sm"
              />
            </div>

            {/* Preview Action Bar: Multi-page Navigator + Draft Preview Trigger */}
            <div className="w-full max-w-[420px] flex flex-wrap items-center justify-between gap-2">
              {shareMode === 'multi' && pagination.totalPages > 1 ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800">
                  <button
                    type="button"
                    disabled={currentPageIdx <= 0}
                    onClick={() => setCurrentPageIdx((p) => Math.max(0, p - 1))}
                    aria-label="上一張圖卡"
                    className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-stone-600 dark:text-stone-300 disabled:opacity-30 hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-medium tabular-nums text-stone-700 dark:text-stone-200 px-1.5">
                    第 {currentPageIdx + 1} / {pagination.totalPages} 張
                  </span>
                  <button
                    type="button"
                    disabled={currentPageIdx >= pagination.totalPages - 1}
                    onClick={() =>
                      setCurrentPageIdx((p) => Math.min(pagination.totalPages - 1, p + 1))
                    }
                    aria-label="下一張圖卡"
                    className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-stone-600 dark:text-stone-300 disabled:opacity-30 hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-stone-400 dark:text-stone-500">
                  {TEMPLATES.find((t) => t.id === config.template)?.label} · {config.ratio}
                  {config.autoFlowLayout ? ' · 自動流式' : ''}
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowDraftPreview(true)}
                className="min-h-[38px] px-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#191918] text-xs font-medium text-stone-700 dark:text-stone-200 inline-flex items-center gap-1.5 hover:border-[#284152] dark:hover:border-stone-500 transition-colors"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-[#9E3B33] dark:text-[#E07A70]" />
                <span>草稿預覽（5 種版型）</span>
              </button>
            </div>

            {exportStatus && (
              <p className="text-xs font-medium text-[#284152] dark:text-[#E7E5E0] inline-flex items-center gap-1.5 text-center">
                <Check className="w-4 h-4 shrink-0" />
                <span>{exportStatus}</span>
              </p>
            )}
          </div>

          {/* Right: Studio Controls (Simple Mode / Detailed Mode) */}
          <div className="lg:col-span-6 space-y-5 bg-white dark:bg-[#191918] border border-stone-200/80 dark:border-stone-800 rounded-2xl p-5 sm:p-6">
            {/* Section 1: Work Picker (Shared by Simple & Detailed) */}
            <div className="space-y-3 pb-5 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                  {studioMode === 'detailed' ? '一 · 作品來源與章節' : '1. 選擇作品'}
                </span>
                <span className="text-[11px] tabular-nums text-stone-400">
                  符合 {filteredWorks.length} 件
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#F7F6F2] dark:bg-[#222220]">
                  {(
                    [
                      { id: 'all', label: '全部' },
                      { id: 'photography', label: '攝影' },
                      { id: 'writing', label: '文字' },
                    ] as { id: 'all' | WorkType; label: string }[]
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFilterType(t.id)}
                      className={`relative min-h-[36px] rounded-lg text-xs font-medium transition-colors flex items-center justify-center ${
                        filterType === t.id
                          ? 'text-stone-900 dark:text-stone-100'
                          : 'text-stone-500 dark:text-stone-400'
                      }`}
                    >
                      {filterType === t.id && (
                        <SlidingPill
                          layoutId="studio-filter-pill"
                          className="bg-white dark:bg-[#141413] shadow-sm rounded-lg"
                        />
                      )}
                      <span className="relative z-10">{t.label}</span>
                    </button>
                  ))}
                </div>

                <select
                  value={filterCollectionId}
                  onChange={(e) => setFilterCollectionId(e.target.value)}
                  aria-label="篩選作品集"
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-xs font-medium text-stone-800 dark:text-stone-200"
                >
                  <option value="all">全部作品集</option>
                  <option value="__none__">未加入作品集</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {filteredWorks.length > 0 ? (
                <select
                  value={activeWork?.id || ''}
                  onChange={(e) => setSelectedWorkId(e.target.value)}
                  aria-label="選擇要製作圖卡的作品"
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-sm text-stone-900 dark:text-stone-100"
                >
                  {filteredWorks.map((w) => (
                    <option key={w.id} value={w.id}>
                      [{w.type === 'photography' ? '攝影' : w.writingGenre || '文字'}]{' '}
                      {w.title} ({w.createdAt})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="px-3.5 py-3 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] text-xs text-stone-500 dark:text-stone-400">
                  此類型或作品集下目前沒有未鎖定作品，請切換上方篩選條件。
                </div>
              )}

              {activeWork?.chapters && activeWork.chapters.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 mb-1.5">
                    章節選擇（共 {activeWork.chapters.length} 章）
                  </label>
                  <select
                    value={selectedChapterIdx === 'all' ? 'all' : String(selectedChapterIdx)}
                    onChange={(e) =>
                      setSelectedChapterIdx(
                        e.target.value === 'all' ? 'all' : Number(e.target.value)
                      )
                    }
                    className="w-full min-h-[40px] px-3 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-xs text-stone-900 dark:text-stone-100"
                  >
                    <option value="all">全部章節合併</option>
                    {activeWork.chapters.map((ch, idx) => (
                      <option key={ch.id} value={idx}>
                        第 {idx + 1} 章 · {ch.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Section 2: Unified Title + Merged Quote & Long-Text Pagination Block */}
            <div className="space-y-3.5 pb-5 border-b border-stone-100 dark:border-stone-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                  {studioMode === 'detailed'
                    ? '二 · 圖卡標題與內文摘錄'
                    : '2. 標題與內文設定'}
                </span>

                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#F7F6F2] dark:bg-[#222220]">
                  <button
                    type="button"
                    onClick={() => setShareMode('single')}
                    className={`relative min-h-[32px] px-3 rounded-lg text-xs font-medium transition-colors flex items-center justify-center ${
                      shareMode === 'single'
                        ? 'text-stone-900 dark:text-stone-100'
                        : 'text-stone-500 dark:text-stone-400'
                    }`}
                  >
                    {shareMode === 'single' && (
                      <SlidingPill
                        layoutId="studio-sharemode-pill"
                        className="bg-white dark:bg-[#141413] shadow-sm rounded-lg"
                      />
                    )}
                    <span className="relative z-10">單張精華</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShareMode('multi')}
                    className={`relative min-h-[32px] px-3 rounded-lg text-xs font-medium transition-colors tabular-nums flex items-center justify-center ${
                      shareMode === 'multi'
                        ? 'text-stone-900 dark:text-stone-100'
                        : 'text-stone-500 dark:text-stone-400'
                    }`}
                  >
                    {shareMode === 'multi' && (
                      <SlidingPill
                        layoutId="studio-sharemode-pill"
                        className="bg-white dark:bg-[#141413] shadow-sm rounded-lg"
                      />
                    )}
                    <span className="relative z-10">
                      多圖分頁{fullTextPageCount > 1 ? ` (${fullTextPageCount}張)` : ''}
                    </span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 mb-1">
                  圖卡標題
                </label>
                <input
                  type="text"
                  value={config.customTitle}
                  onChange={(e) => setConfig({ ...config, customTitle: e.target.value })}
                  className="w-full min-h-[42px] px-3 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-sm text-stone-900 dark:text-stone-100"
                />
              </div>

              {/* Unified Quote Editor + Markdown Switch (Detailed) + Paragraph Picker */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-medium text-stone-500 dark:text-stone-400">
                    {shareMode === 'multi'
                      ? `內文（將自動排版為 ${pagination.totalPages} 張圖卡）`
                      : '內文摘錄 / 攝影短語'}
                  </label>
                  <div className="flex items-center gap-3">
                    {studioMode === 'detailed' && (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={config.useMarkdown ?? true}
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            useMarkdown: !(prev.useMarkdown ?? true),
                          }))
                        }
                        className={`min-h-[28px] px-2.5 rounded-lg text-[11px] font-medium border transition-colors ${
                          config.useMarkdown ?? true
                            ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152]/10 dark:bg-stone-800 text-[#284152] dark:text-stone-100'
                            : 'border-stone-200 dark:border-stone-700 text-stone-400'
                        }`}
                      >
                        Markdown 語法：{config.useMarkdown ?? true ? '開啟' : '已關閉'}
                      </button>
                    )}

                    {shareMode === 'multi' && (config.customQuote !== sourceFullText || manualPages !== null) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSegmentIndices([]);
                          setManualPages(null);
                          setShowPageAssigner(false);
                          setConfig((prev) => ({ ...prev, customQuote: sourceFullText }));
                          setCurrentPageIdx(0);
                        }}
                        className="text-xs font-medium text-[#284152] dark:text-stone-300 underline"
                      >
                        載入全文分頁
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  rows={shareMode === 'multi' ? 5 : 3}
                  value={config.customQuote}
                  onChange={(e) => {
                    if (manualPages) setManualPages(null);
                    setConfig({ ...config, customQuote: e.target.value });
                  }}
                  placeholder="可直接輸入文字（或貼上從閱讀頁複製的段落）..."
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-sm leading-relaxed text-stone-900 dark:text-stone-100"
                />

                {studioMode === 'detailed' && (config.useMarkdown ?? true) && !conciseCopyMode && (
                  <p className="text-[11px] text-stone-400 dark:text-stone-500">
                    支援簡易語法：<code className="px-1">**粗體**</code> · <code className="px-1">*斜體*</code> · <code className="px-1">~~刪除線~~</code> · <code className="px-1">`強調`</code> · <code className="px-1">&gt; 引言</code>
                  </p>
                )}

                {fullTextPageCount > 1 && shareMode === 'single' && (
                  <div className="px-3 py-2 rounded-xl bg-[#EFECE6]/80 dark:bg-[#222220] text-[11px] text-stone-600 dark:text-stone-300 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      原文較長（完整輸出約需{' '}
                      <strong className="tabular-nums">{fullTextPageCount}</strong> 張圖卡）
                    </span>
                    <button
                      type="button"
                      onClick={() => setShareMode('multi')}
                      className="font-medium text-[#9E3B33] dark:text-[#E07A70] underline"
                    >
                      切換為多圖分頁
                    </button>
                  </div>
                )}

                {selectableSegments.length > 0 && (
                  <div className="space-y-2 pt-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setShowSegmentPicker((s) => !s)}
                        className={`min-h-[36px] px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                          showSegmentPicker
                            ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152]/10 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
                            : 'border-stone-200 dark:border-stone-800 bg-[#F7F6F2] dark:bg-[#222220] text-stone-700 dark:text-stone-300'
                        }`}
                      >
                        <ListChecks className="w-3.5 h-3.5" />
                        <span>
                          {showSegmentPicker
                            ? '收合原文挑選器'
                            : '從原文挑選特定段落或語句'}
                        </span>
                      </button>

                      {selectedSegmentIndices.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSegmentIndices([]);
                            setManualPages(null);
                            const fallback =
                              shareMode === 'multi'
                                ? sourceFullText
                                : sourceFullText.split('\n').slice(0, 5).join('\n');
                            setConfig((prev) => ({ ...prev, customQuote: fallback }));
                            setCurrentPageIdx(0);
                          }}
                          className="text-[11px] text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 underline"
                        >
                          清除已選 ({selectedSegmentIndices.length})
                        </button>
                      )}
                    </div>

                    <SmoothCollapse
                      open={showSegmentPicker}
                      animate={animationOverhaul}
                      unmountOnClose={false}
                      durationMs={220}
                    >
                      <div className="p-3 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/80 dark:border-stone-800 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#EFECE6] dark:bg-[#191918]">
                            <button
                              type="button"
                              onClick={() => {
                                setSegmentSplitMode('paragraph');
                                setSelectedSegmentIndices([]);
                              }}
                              className={`relative px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                                segmentSplitMode === 'paragraph'
                                  ? 'text-stone-900 dark:text-stone-100'
                                  : 'text-stone-500'
                              }`}
                            >
                              {segmentSplitMode === 'paragraph' && (
                                <SlidingPill
                                  layoutId="studio-segment-pill"
                                  className="bg-white dark:bg-[#2A2A28] shadow-sm rounded-md"
                                />
                              )}
                              <span className="relative z-10">按段落挑選</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSegmentSplitMode('sentence');
                                setSelectedSegmentIndices([]);
                              }}
                              className={`relative px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                                segmentSplitMode === 'sentence'
                                  ? 'text-stone-900 dark:text-stone-100'
                                  : 'text-stone-500'
                              }`}
                            >
                              {segmentSplitMode === 'sentence' && (
                                <SlidingPill
                                  layoutId="studio-segment-pill"
                                  className="bg-white dark:bg-[#2A2A28] shadow-sm rounded-md"
                                />
                              )}
                              <span className="relative z-10">按句子挑選</span>
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-stone-400 tabular-nums">
                              已選 {selectedSegmentIndices.length}/{selectableSegments.length}
                            </span>
                            <button
                              type="button"
                              onClick={handleToggleSelectAllSegments}
                              className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                                allSegmentsSelected
                                  ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900'
                                  : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-[#1B1B19] text-stone-700 dark:text-stone-200 hover:border-stone-400'
                              }`}
                            >
                              {allSegmentsSelected ? '取消全選' : '全選全部'}
                            </button>
                          </div>
                        </div>

                        <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                          {selectableSegments.map((seg, idx) => {
                            const picked = selectedSegmentIndices.includes(idx);
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => toggleSegment(idx)}
                                className={`w-full p-2.5 rounded-lg border text-left text-xs leading-relaxed transition-colors flex items-start gap-2 ${
                                  picked
                                    ? 'border-[#284152] dark:border-[#E7E5E0] bg-white dark:bg-[#181817] text-stone-900 dark:text-stone-100'
                                    : 'border-stone-200/70 dark:border-stone-800 bg-white/50 dark:bg-[#1B1B19] text-stone-600 dark:text-stone-300 hover:bg-white dark:hover:bg-[#1E1E1C]'
                                }`}
                              >
                                <span
                                  className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                    picked
                                      ? 'bg-[#284152] dark:bg-[#E7E5E0] border-[#284152] dark:border-[#E7E5E0] text-white dark:text-stone-900'
                                      : 'border-stone-300 dark:border-stone-600'
                                  }`}
                                >
                                  {picked && <Check className="w-3 h-3" />}
                                </span>
                                <span className="line-clamp-3">{seg}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </SmoothCollapse>
                  </div>
                )}

                {/* Detailed Mode + Multi-page: Custom Per-Page Paragraph/Sentence Assignment */}
                <SmoothCollapse
                  open={studioMode === 'detailed' && shareMode === 'multi'}
                  animate={animationOverhaul}
                  unmountOnClose={false}
                  durationMs={220}
                  innerClassName="space-y-2 pt-1"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!manualPages) {
                            initOrRepackManualPages();
                          } else {
                            setShowPageAssigner((s) => !s);
                          }
                        }}
                        className={`min-h-[36px] px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                          showPageAssigner
                            ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152]/10 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
                            : 'border-stone-200 dark:border-stone-800 bg-[#F7F6F2] dark:bg-[#222220] text-stone-700 dark:text-stone-300'
                        }`}
                      >
                        <Scissors className="w-3.5 h-3.5" />
                        <span>
                          {showPageAssigner
                            ? '收合各頁斷句微調'
                            : '自訂各頁包含的段落與句子'}
                        </span>
                        {manualPages && (
                          <span className="ml-0.5 px-1.5 py-0.5 rounded bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-[10px] tabular-nums">
                            {manualPages.length} 頁
                          </span>
                        )}
                      </button>

                      {manualPages && (
                        <button
                          type="button"
                          onClick={() => {
                            setManualPages(null);
                            setShowPageAssigner(false);
                            setCurrentPageIdx(0);
                          }}
                          className="text-[11px] text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 underline"
                        >
                          恢復自動分頁
                        </button>
                      )}
                    </div>

                    {showPageAssigner && manualPages && (
                      <div className="p-3 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/80 dark:border-stone-800 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#EFECE6] dark:bg-[#191918]">
                            <button
                              type="button"
                              onClick={() => initOrRepackManualPages('sentence')}
                              className={`relative px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                                manualUnitMode === 'sentence'
                                  ? 'text-stone-900 dark:text-stone-100'
                                  : 'text-stone-500'
                              }`}
                            >
                              {manualUnitMode === 'sentence' && (
                                <SlidingPill
                                  layoutId="studio-manualunit-pill"
                                  className="bg-white dark:bg-[#2A2A28] shadow-sm rounded-md"
                                />
                              )}
                              <span className="relative z-10">依完整句子拆解</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => initOrRepackManualPages('paragraph')}
                              className={`relative px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                                manualUnitMode === 'paragraph'
                                  ? 'text-stone-900 dark:text-stone-100'
                                  : 'text-stone-500'
                              }`}
                            >
                              {manualUnitMode === 'paragraph' && (
                                <SlidingPill
                                  layoutId="studio-manualunit-pill"
                                  className="bg-white dark:bg-[#2A2A28] shadow-sm rounded-md"
                                />
                              )}
                              <span className="relative z-10">依段落拆解</span>
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => initOrRepackManualPages()}
                            className="text-[11px] font-medium text-[#284152] dark:text-stone-300 inline-flex items-center gap-1 hover:underline"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>智慧不截斷重排</span>
                          </button>
                        </div>

                        {!conciseCopyMode && (
                          <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
                            點選頁數可預覽該頁版面，並可自由將首末句上移、下移或從特定位置獨立換頁。
                          </p>
                        )}

                        <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                          {manualPages.map((units, pIdx) => {
                            const isActivePage = currentPageIdx === pIdx;
                            const isOverflowing = Boolean(pagination.pageOverflows?.[pIdx]);
                            return (
                              <div
                                key={pIdx}
                                className={`p-2.5 rounded-xl border space-y-2 transition-colors ${
                                  isActivePage
                                    ? 'border-[#284152] dark:border-[#E7E5E0] bg-white dark:bg-[#181817]'
                                    : 'border-stone-200/80 dark:border-stone-800 bg-white/60 dark:bg-[#1B1B19]'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setCurrentPageIdx(pIdx)}
                                    className="text-xs font-semibold text-stone-800 dark:text-stone-100 inline-flex items-center gap-1.5"
                                  >
                                    <span>第 {pIdx + 1} 頁</span>
                                    <span className="text-[11px] font-normal text-stone-400 tabular-nums">
                                      ({units.length} 段)
                                    </span>
                                  </button>

                                  <div className="flex items-center gap-2">
                                    {isOverflowing && (
                                      <span className="text-[10px] font-medium text-[#9E3B33] dark:text-[#E07A70] inline-flex items-center gap-0.5">
                                        <AlertTriangle className="w-3 h-3" />
                                        <span>內容略滿，建議移至下頁</span>
                                      </span>
                                    )}
                                    {pIdx < manualPages.length - 1 && (
                                      <button
                                        type="button"
                                        onClick={() => mergePageWithNext(pIdx)}
                                        className="text-[10px] text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 underline"
                                      >
                                        合併下頁
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="space-y-1.5">
                                  {units.map((unitText, uIdx) => (
                                    <div
                                      key={`${pIdx}_${uIdx}`}
                                      className="p-2 rounded-lg bg-[#F7F6F2] dark:bg-[#222220] text-xs text-stone-700 dark:text-stone-200 space-y-1.5"
                                    >
                                      <div className="leading-relaxed line-clamp-2">
                                        {unitText}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        {uIdx === 0 && pIdx > 0 && (
                                          <button
                                            type="button"
                                            onClick={() => moveUnitToPrevPage(pIdx)}
                                            className="px-2 py-0.5 rounded bg-white dark:bg-[#191918] border border-stone-200 dark:border-stone-700 text-[10px] font-medium text-stone-600 dark:text-stone-300 inline-flex items-center gap-1 hover:border-[#284152]"
                                          >
                                            <ArrowUp className="w-2.5 h-2.5" />
                                            <span>移至第 {pIdx} 頁</span>
                                          </button>
                                        )}
                                        {uIdx < units.length - 1 && (
                                          <button
                                            type="button"
                                            onClick={() => splitPageAfterUnit(pIdx, uIdx)}
                                            className="px-2 py-0.5 rounded bg-white dark:bg-[#191918] border border-stone-200 dark:border-stone-700 text-[10px] font-medium text-stone-600 dark:text-stone-300 inline-flex items-center gap-1 hover:border-[#284152]"
                                          >
                                            <Scissors className="w-2.5 h-2.5" />
                                            <span>於此後換頁</span>
                                          </button>
                                        )}
                                        {uIdx === units.length - 1 && (
                                          <button
                                            type="button"
                                            onClick={() => moveUnitToNextPage(pIdx)}
                                            className="px-2 py-0.5 rounded bg-white dark:bg-[#191918] border border-stone-200 dark:border-stone-700 text-[10px] font-medium text-stone-600 dark:text-stone-300 inline-flex items-center gap-1 hover:border-[#284152]"
                                          >
                                            <ArrowDown className="w-2.5 h-2.5" />
                                            <span>移至第 {pIdx + 2} 頁</span>
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                </SmoothCollapse>
              </div>
            </div>

            {/* Section 3: Style, Templates, Saved Presets & Draft Preview */}
            <div
              className={`space-y-4 ${
                studioMode === 'detailed'
                  ? 'pb-5 border-b border-stone-100 dark:border-stone-800'
                  : ''
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 dark:text-stone-300">
                    <Layers className="w-3.5 h-3.5" />
                    <span>
                      {studioMode === 'detailed' ? '三 · 版型模板與自訂預設' : '3. 版型與風格'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDraftPreview(true)}
                    className="text-xs font-medium text-[#284152] dark:text-[#E7E5E0] inline-flex items-center gap-1 hover:underline"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>開啟草稿預覽</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {TEMPLATES.map((tpl) => {
                    const active = !activeSavedTemplateId && config.template === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => applyTemplate(tpl.id)}
                        className={`min-h-[42px] px-3 py-2 rounded-xl text-left border transition-all ${
                          active
                            ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152]/5 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
                            : 'border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800/40'
                        }`}
                      >
                        <div className="text-xs font-semibold">{tpl.label}</div>
                      </button>
                    );
                  })}
                </div>

                {/* User Saved Custom Templates (Shown in both Simple & Detailed if any exist) */}
                {savedTemplates.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                      我的自訂模版
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {savedTemplates.map((st) => {
                        const isDefault = defaultTemplateId === st.id;
                        const isActive = activeSavedTemplateId === st.id;
                        return (
                          <div
                            key={st.id}
                            className={`inline-flex items-center rounded-xl border overflow-hidden transition-colors ${
                              isActive
                                ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152]/8 dark:bg-stone-800'
                                : 'border-stone-200 dark:border-stone-800 bg-[#F7F6F2] dark:bg-[#222220]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => applySavedTemplate(st)}
                              className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-800 dark:text-stone-200 inline-flex items-center gap-1.5"
                            >
                              {isDefault && (
                                <Star className="w-3 h-3 fill-[#9E3B33] text-[#9E3B33] dark:fill-[#E07A70] dark:text-[#E07A70]" />
                              )}
                              <span>{st.name}</span>
                            </button>
                            {studioMode === 'detailed' && onSetDefaultTemplate && (
                              <button
                                type="button"
                                onClick={() => void onSetDefaultTemplate(isDefault ? '' : st.id)}
                                title={isDefault ? '取消設為預設' : '設為下次開啟預設模版'}
                                aria-label={`設 ${st.name} 為預設`}
                                className="px-1.5 py-1.5 text-stone-400 hover:text-[#284152] dark:hover:text-stone-200"
                              >
                                <Star
                                  className={`w-3.5 h-3.5 ${
                                    isDefault ? 'fill-[#9E3B33] text-[#9E3B33]' : ''
                                  }`}
                                />
                              </button>
                            )}
                            {studioMode === 'detailed' && onDeleteCustomTemplate && (
                              <button
                                type="button"
                                onClick={() => void onDeleteCustomTemplate(st.id)}
                                title="刪除自訂模版"
                                aria-label={`刪除模版 ${st.name}`}
                                className="pr-2.5 pl-1 py-1.5 text-stone-400 hover:text-[#9E3B33]"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Detailed Mode: Save Current Layout as Preset Template */}
                {studioMode === 'detailed' && onSaveCustomTemplate && (
                  <div className="mt-3 pt-2.5 border-t border-stone-100 dark:border-stone-800/80">
                    {!saveTemplateOpen ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSaveTemplateOpen(true)}
                          className="min-h-[38px] px-3.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Bookmark className="w-3.5 h-3.5" />
                          <span>儲存為預設模版</span>
                        </button>
                        {templateNotice && (
                          <span className="text-[11px] font-medium text-[#284152] dark:text-stone-300">
                            {templateNotice}
                          </span>
                        )}
                      </div>
                    ) : (
                      <form
                        onSubmit={handleSavePresetTemplate}
                        className="p-3 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-800 space-y-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            autoFocus
                            value={saveTemplateName}
                            onChange={(e) => setSaveTemplateName(e.target.value)}
                            placeholder="輸入模版名稱（如：深夜書摘）"
                            className="flex-1 min-h-[38px] px-3 rounded-lg bg-white dark:bg-[#191918] border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={savingTpl || !saveTemplateName.trim()}
                            className="min-h-[38px] px-3.5 rounded-lg bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-xs font-medium disabled:opacity-40 shrink-0"
                          >
                            {savingTpl ? '儲存中' : '儲存'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSaveTemplateOpen(false)}
                            className="min-h-[38px] px-2 text-xs text-stone-500"
                          >
                            取消
                          </button>
                        </div>
                        <label className="flex items-center gap-2 text-[11px] text-stone-600 dark:text-stone-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={saveAsDefaultTpl}
                            onChange={(e) => setSaveAsDefaultTpl(e.target.checked)}
                            className="w-3.5 h-3.5 accent-[#284152]"
                          />
                          <span>同時設為下次開啟工作室時的預設模版</span>
                        </label>
                      </form>
                    )}
                  </div>
                )}
              </div>

              {/* Font Style Picker */}
              <div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-stone-500 dark:text-stone-400 mb-2">
                  <Type className="w-3.5 h-3.5" />
                  <span>字體風格</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SHARE_FONTS.map((font) => {
                    const active = config.fontFamily === font.id;
                    return (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => setConfig((prev) => ({ ...prev, fontFamily: font.id }))}
                        className={`min-h-[52px] px-3 py-2 rounded-xl text-left border transition-all flex items-center justify-between gap-2 ${
                          active
                            ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152]/5 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
                            : 'border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800/40'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate">
                            {font.label}
                          </div>
                          <div className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5">
                            {font.badge}
                          </div>
                        </div>
                        <div
                          className="text-sm font-medium shrink-0 text-stone-700 dark:text-stone-300"
                          style={{ fontFamily: font.stack }}
                        >
                          {font.sample}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Paper Swatches (Shown cleanly in both Simple & Detailed) */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <label className="text-xs font-medium text-stone-500 dark:text-stone-400">
                    紙張色調
                  </label>
                  <span className="text-xs font-medium text-stone-700 dark:text-stone-300">
                    {PAPER_SWATCHES.find((s) => s.paper === config.paperColor)?.label || '自訂'}
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-2.5 sm:gap-3">
                  {PAPER_SWATCHES.map((s) => {
                    const selected = config.paperColor === s.paper;
                    return (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() =>
                          setConfig({
                            ...config,
                            paperColor: s.paper,
                            textColor: s.text,
                            accentColor: s.accent,
                          })
                        }
                        title={s.label}
                        aria-label={`紙張色調：${s.label}`}
                        className={`w-9 h-9 mx-auto rounded-full border transition-transform flex items-center justify-center ${
                          selected
                            ? 'scale-110 ring-2 ring-[#284152] dark:ring-stone-200 ring-offset-2 dark:ring-offset-[#191918]'
                            : 'border-stone-300/90 dark:border-stone-700 hover:scale-105'
                        }`}
                        style={{ backgroundColor: s.paper }}
                      >
                        {selected && (
                          <Check
                            className="w-3.5 h-3.5"
                            style={{ color: s.text }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Photography-Exclusive Frame Style Picker (Shown in Simple & Detailed for photography works) */}
              {activeWork?.type === 'photography' && loadedImg && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-stone-500 dark:text-stone-400">
                      攝影相框樣式
                    </label>
                    <span className="text-[11px] text-stone-400 dark:text-stone-500">
                      {PHOTO_FRAME_STYLES.find((f) => f.id === (config.photoFrameStyle ?? 'none'))?.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PHOTO_FRAME_STYLES.map((frame) => {
                      const active = (config.photoFrameStyle ?? 'none') === frame.id;
                      return (
                        <button
                          key={frame.id}
                          type="button"
                          onClick={() =>
                            setConfig((prev) => ({ ...prev, photoFrameStyle: frame.id }))
                          }
                          className={`min-h-[44px] px-3 py-2 rounded-xl text-left border transition-all ${
                            active
                              ? 'border-[#284152] dark:border-[#E7E5E0] bg-[#284152]/6 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
                              : 'border-stone-200 dark:border-stone-800 bg-[#F7F6F2]/60 dark:bg-[#222220]/70 text-stone-600 dark:text-stone-400 hover:bg-stone-100/70 dark:hover:bg-stone-800/40'
                          }`}
                        >
                          <div className="text-xs font-semibold">{frame.label}</div>
                          {!conciseCopyMode && (
                            <div className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5 truncate">
                              {frame.desc}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {studioMode === 'simple' && activeWork?.type === 'photography' && loadedImg && (
                <div className="p-3 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/80 dark:border-stone-800 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-stone-800 dark:text-stone-200 inline-flex items-center gap-1.5">
                      <Crop className="w-3.5 h-3.5 text-[#284152] dark:text-[#E7E5E0]" />
                      <span>相片比例與視覺化裁切取景</span>
                    </div>
                    {!conciseCopyMode && (
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                        調整照片滿版／完整保留、縮放倍率與拖曳焦點位置
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStudioMode('detailed');
                      window.setTimeout(() => {
                        cropSectionRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'center',
                        });
                      }, 260);
                    }}
                    className="min-h-[34px] px-3 rounded-lg bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-[11px] font-medium shrink-0"
                  >
                    開啟裁切調整
                  </button>
                </div>
              )}
            </div>

            {/* Section 4: Detailed Mode Only — Auto-Flow, Ratio, Sliders, Alignment, Metadata Toggles & Signature */}
            <SmoothCollapse
              open={studioMode === 'detailed'}
              animate={animationOverhaul}
              unmountOnClose={false}
              durationMs={250}
              innerClassName="space-y-4"
            >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 dark:text-stone-300">
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>四 · 畫布比例、流式排版與落款</span>
                  </div>
                  {config.template !== 'vertical' && (
                    <div className="flex items-center gap-1 bg-[#F7F6F2] dark:bg-[#222220] p-1 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setConfig({ ...config, textAlign: 'left' })}
                        aria-label="靠左對齊"
                        className={`p-1.5 rounded-md ${
                          config.textAlign === 'left'
                            ? 'bg-white dark:bg-[#141413] text-stone-900 dark:text-stone-100 shadow-sm'
                            : 'text-stone-400'
                        }`}
                      >
                        <AlignLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfig({ ...config, textAlign: 'center' })}
                        aria-label="置中對齊"
                        className={`p-1.5 rounded-md ${
                          config.textAlign === 'center'
                            ? 'bg-white dark:bg-[#141413] text-stone-900 dark:text-stone-100 shadow-sm'
                            : 'text-stone-400'
                        }`}
                      >
                        <AlignCenter className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Auto-Flow Text Layout Toggle */}
                <div className="p-3.5 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/80 dark:border-stone-800 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-stone-800 dark:text-stone-200 inline-flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#9E3B33] dark:text-[#E07A70]" />
                      <span>自動文字流式佈局</span>
                    </div>
                    {!conciseCopyMode && (
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
                        開啟後將依卡片比例、字數與圖片留白自動調整斷行與字體縮放（目前 {Math.round(effectiveConfig.fontSize * 100)}%）。
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(config.autoFlowLayout)}
                    onClick={() =>
                      setConfig((prev) => ({
                        ...prev,
                        autoFlowLayout: !prev.autoFlowLayout,
                      }))
                    }
                    className={`min-h-[36px] px-3.5 rounded-xl text-xs font-medium shrink-0 border transition-colors ${
                      config.autoFlowLayout
                        ? 'bg-[#284152] dark:bg-[#E7E5E0] border-transparent text-white dark:text-stone-900'
                        : 'bg-white dark:bg-[#191918] border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300'
                    }`}
                  >
                    {config.autoFlowLayout ? '已開啟' : '手動微調'}
                  </button>
                </div>

                {/* Aspect Ratio */}
                <div>
                  <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 mb-2">
                    畫布比例
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#F7F6F2] dark:bg-[#222220] rounded-xl">
                    {(
                      [
                        { id: '3:4', label: '3:4 貼文' },
                        { id: '1:1', label: '1:1 方形' },
                        { id: '9:16', label: '9:16 限動' },
                      ] as { id: ShareRatio; label: string }[]
                    ).map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setConfig({ ...config, ratio: r.id })}
                        className={`relative min-h-[38px] rounded-lg text-xs font-medium transition-colors flex items-center justify-center ${
                          config.ratio === r.id
                            ? 'text-stone-900 dark:text-stone-100'
                            : 'text-stone-500 dark:text-stone-400'
                        }`}
                      >
                        {config.ratio === r.id && (
                          <SlidingPill
                            layoutId="studio-ratio-pill"
                            className="bg-white dark:bg-[#141413] shadow-sm rounded-lg"
                          />
                        )}
                        <span className="relative z-10">{r.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Photo Framing: Aspect Ratio & Crop Range (Photography works in Detailed Mode) */}
                {activeWork?.type === 'photography' && loadedImg && (
                  <div className="p-3.5 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200/80 dark:border-stone-800 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-stone-800 dark:text-stone-200 inline-flex items-center gap-1.5">
                        <Crop className="w-3.5 h-3.5 text-[#284152] dark:text-[#E7E5E0]" />
                        <span>影像比例與裁切範圍</span>
                      </div>
                      {((config.photoFit ?? 'contain') !== 'contain' ||
                        (config.photoAspect ?? 'original') !== 'original' ||
                        (config.photoZoom ?? 1) !== 1 ||
                        (config.photoOffsetX ?? 0) !== 0 ||
                        (config.photoOffsetY ?? 0) !== 0) && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              photoFit: 'contain',
                              photoAspect: 'original',
                              photoZoom: 1,
                              photoOffsetX: 0,
                              photoOffsetY: 0,
                            }))
                          }
                          className="text-[11px] font-medium text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 inline-flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>恢復完整原圖</span>
                        </button>
                      )}
                    </div>

                    {/* Fit mode: Preserve whole photo vs Fill & Crop */}
                    <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#EFECE6] dark:bg-[#191918]">
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            photoFit: 'contain',
                            photoZoom: 1,
                            photoOffsetX: 0,
                            photoOffsetY: 0,
                          }))
                        }
                        className={`relative min-h-[36px] px-2.5 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${
                          (config.photoFit ?? 'contain') === 'contain'
                            ? 'text-stone-900 dark:text-stone-100'
                            : 'text-stone-500 dark:text-stone-400'
                        }`}
                      >
                        {(config.photoFit ?? 'contain') === 'contain' && (
                          <SlidingPill
                            layoutId="studio-photofit-pill"
                            className="bg-white dark:bg-[#141413] shadow-sm rounded-lg"
                          />
                        )}
                        <Maximize2 className="w-3.5 h-3.5 relative z-10" />
                        <span className="relative z-10">完整原圖（不裁切）</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({ ...prev, photoFit: 'cover' }))
                        }
                        className={`relative min-h-[36px] px-2.5 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${
                          config.photoFit === 'cover'
                            ? 'text-stone-900 dark:text-stone-100'
                            : 'text-stone-500 dark:text-stone-400'
                        }`}
                      >
                        {config.photoFit === 'cover' && (
                          <SlidingPill
                            layoutId="studio-photofit-pill"
                            className="bg-white dark:bg-[#141413] shadow-sm rounded-lg"
                          />
                        )}
                        <Crop className="w-3.5 h-3.5 relative z-10" />
                        <span className="relative z-10">滿版裁切調整</span>
                      </button>
                    </div>

                    {/* Photo Frame Aspect Ratio */}
                    <div>
                      <div className="text-[11px] text-stone-500 dark:text-stone-400 mb-1.5">
                        相框呈現比例
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                        {(
                          [
                            { id: 'original', label: '原圖比例' },
                            { id: '4:3', label: '4:3' },
                            { id: '3:2', label: '3:2' },
                            { id: '1:1', label: '1:1' },
                            { id: '16:9', label: '16:9' },
                            { id: '3:4', label: '3:4' },
                          ] as { id: SharePhotoAspect; label: string }[]
                        ).map((opt) => {
                          const active = (config.photoAspect ?? 'original') === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() =>
                                setConfig((prev) => ({ ...prev, photoAspect: opt.id }))
                              }
                              className={`min-h-[34px] px-2 rounded-lg text-[11px] font-medium border transition-colors ${
                                active
                                  ? 'bg-[#284152] dark:bg-[#E7E5E0] border-transparent text-white dark:text-stone-900'
                                  : 'bg-white dark:bg-[#191918] border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Interactive Graphic Drag-to-Crop & Pinch-Zoom Viewfinder */}
                    <div ref={cropSectionRef}>
                      <InteractivePhotoCropper
                        imageSrc={activeWork.imageData || ''}
                        imgNaturalW={loadedImg.naturalWidth}
                        imgNaturalH={loadedImg.naturalHeight}
                        frameAspect={resolvePhotoFrameAspect(
                          effectiveConfig,
                          loadedImg,
                          dimensions.width,
                          dimensions.height
                        )}
                        photoFit={config.photoFit ?? 'contain'}
                        zoom={config.photoZoom ?? 1}
                        offsetX={config.photoOffsetX ?? 0}
                        offsetY={config.photoOffsetY ?? 0}
                        conciseCopyMode={conciseCopyMode}
                        onLiveCropChange={(nextZoom, nextX, nextY) =>
                          setLiveCropOverride({
                            photoZoom: nextZoom,
                            photoOffsetX: nextX,
                            photoOffsetY: nextY,
                          })
                        }
                        onCommitCrop={(nextZoom, nextX, nextY) => {
                          setLiveCropOverride(null);
                          setConfig((prev) => ({
                            ...prev,
                            photoZoom: nextZoom,
                            photoOffsetX: nextX,
                            photoOffsetY: nextY,
                          }));
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Typography & Spacing Sliders */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-1">
                  <label className={`space-y-1.5 ${config.autoFlowLayout ? 'opacity-50' : ''}`}>
                    <div className="flex justify-between text-stone-500">
                      <span>{config.autoFlowLayout ? '文字大小（自動）' : '文字大小'}</span>
                      <span className="tabular-nums">
                        {Math.round(effectiveConfig.fontSize * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.8"
                      max="1.35"
                      step="0.05"
                      disabled={Boolean(config.autoFlowLayout)}
                      value={effectiveConfig.fontSize}
                      onChange={(e) =>
                        setConfig({ ...config, fontSize: Number(e.target.value) })
                      }
                      className="w-full accent-[#284152]"
                    />
                  </label>

                  <label className="space-y-1.5">
                    <div className="flex justify-between text-stone-500">
                      <span>四周留白</span>
                      <span className="tabular-nums">{config.padding}px</span>
                    </div>
                    <input
                      type="range"
                      min="44"
                      max="120"
                      step="4"
                      value={config.padding}
                      onChange={(e) =>
                        setConfig({ ...config, padding: Number(e.target.value) })
                      }
                      className="w-full accent-[#284152]"
                    />
                  </label>

                  <label className="space-y-1.5">
                    <div className="flex justify-between text-stone-500">
                      <span>影像圓角</span>
                      <span className="tabular-nums">{config.cornerRadius}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="28"
                      step="2"
                      value={config.cornerRadius}
                      onChange={(e) =>
                        setConfig({ ...config, cornerRadius: Number(e.target.value) })
                      }
                      className="w-full accent-[#284152]"
                    />
                  </label>
                </div>

                {/* Metadata Visibility Toggles */}
                <div>
                  <span className="block text-xs font-medium text-stone-500 dark:text-stone-400 mb-2">
                    頁尾資訊顯示
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'showDate', label: '日期' },
                      { key: 'showMeta', label: '器材/文體' },
                      { key: 'showAuthor', label: '作者署名' },
                      { key: 'showSeal', label: '落款印章' },
                    ].map((opt) => {
                      const active = config[opt.key as keyof ShareConfig] as boolean;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              [opt.key]: !active,
                            }))
                          }
                          className={`min-h-[38px] px-3 rounded-lg text-xs font-medium border transition-colors ${
                            active
                              ? 'border-[#284152]/40 bg-[#284152]/10 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
                              : 'border-stone-200 dark:border-stone-800 text-stone-400'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Author & Seal Inputs */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[11px] text-stone-400 mb-1">作者署名</label>
                    <input
                      type="text"
                      value={config.authorName}
                      onChange={(e) => setConfig({ ...config, authorName: e.target.value })}
                      placeholder="署名"
                      className="w-full min-h-[40px] px-3 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-xs text-stone-900 dark:text-stone-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-stone-400 mb-1">印章單字</label>
                    <input
                      type="text"
                      maxLength={1}
                      value={config.sealText}
                      onChange={(e) => setConfig({ ...config, sealText: e.target.value })}
                      placeholder="印章字"
                      className="w-full min-h-[40px] px-3 rounded-xl bg-[#F7F6F2] dark:bg-[#222220] border border-stone-200 dark:border-stone-800 text-xs text-center text-stone-900 dark:text-stone-100"
                    />
                  </div>
                </div>
            </SmoothCollapse>
          </div>
        </div>
        {activeWork ? (
          <div className="max-w-6xl mx-auto mt-6 pt-5 pb-2 border-t border-stone-200/80 dark:border-stone-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-stone-500 dark:text-stone-400 text-center sm:text-left">
              {exportStatus ? (
                <span className="font-medium text-[#284152] dark:text-[#E7E5E0] inline-flex items-center gap-1.5">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{exportStatus}</span>
                </span>
              ) : !conciseCopyMode ? (
                <span>調整完成後將直接儲存高畫質圖檔至固定資料夾（文件/FolioCards 或瀏覽器下載）。</span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="w-full sm:w-auto min-h-[48px] px-6 rounded-xl bg-[#284152] dark:bg-[#E7E5E0] text-white dark:text-stone-900 text-sm font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 shadow-sm hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-60"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>{exporting ? '輸出高畫質圖檔...' : exportButtonText}</span>
            </button>
          </div>
        ) : (
          <div className="mt-6 text-center text-xs text-stone-400 flex items-center justify-center gap-1.5">
            <ImageIcon className="w-4 h-4" />
            <span>目前沒有可預覽的未鎖定作品，請先新增作品或調整分類篩選。</span>
          </div>
        )}
      </div>

      {/* Multi-Template Live Draft Preview Modal */}
      <DraftPreviewModal
        open={showDraftPreview}
        onClose={() => setShowDraftPreview(false)}
        config={effectiveConfig}
        activeWork={activeWork}
        loadedImg={loadedImg}
        dimensions={dimensions}
        fontTick={fontTick}
        conciseCopyMode={conciseCopyMode}
        onSelectTemplate={applyTemplate}
        onSelectFont={(fontId) => setConfig((prev) => ({ ...prev, fontFamily: fontId }))}
      />
    </div>
  );
};
