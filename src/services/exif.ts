import exifr from 'exifr';
import { PhotoMeta } from '../types';

export interface ExtractedExifResult {
  meta: PhotoMeta;
  dateStr?: string;
  summary: string;
  hasData: boolean;
}

function formatShutter(exposureTime: unknown): string | undefined {
  if (typeof exposureTime !== 'number' || !Number.isFinite(exposureTime) || exposureTime <= 0) {
    return undefined;
  }
  if (exposureTime < 1) {
    const denom = Math.round(1 / exposureTime);
    return denom > 0 ? `1/${denom}s` : undefined;
  }
  return `${Number(exposureTime.toFixed(1))}s`;
}

function formatAperture(fNumber: unknown): string | undefined {
  if (typeof fNumber !== 'number' || !Number.isFinite(fNumber) || fNumber <= 0) {
    return undefined;
  }
  const rounded = Number(fNumber.toFixed(1));
  return `f/${rounded}`;
}

function formatCameraName(make: unknown, model: unknown): string | undefined {
  const m1 = typeof make === 'string' ? make.trim() : '';
  const m2 = typeof model === 'string' ? model.trim() : '';
  if (!m1 && !m2) return undefined;
  if (!m1) return m2;
  if (!m2) return m1;
  if (m2.toLowerCase().startsWith(m1.toLowerCase())) {
    return m2;
  }
  return `${m1} ${m2}`;
}

function formatLens(
  lensModel: unknown,
  focalLength: unknown,
  focalLength35: unknown
): string | undefined {
  if (typeof lensModel === 'string' && lensModel.trim()) {
    const trimmed = lensModel.trim();
    if (
      typeof focalLength === 'number' &&
      Number.isFinite(focalLength) &&
      !trimmed.includes('mm')
    ) {
      return `${trimmed} (${Math.round(focalLength)}mm)`;
    }
    return trimmed;
  }
  if (typeof focalLength === 'number' && Number.isFinite(focalLength) && focalLength > 0) {
    const fl = `${Math.round(focalLength)}mm`;
    if (
      typeof focalLength35 === 'number' &&
      Number.isFinite(focalLength35) &&
      Math.round(focalLength35) !== Math.round(focalLength)
    ) {
      return `${fl} (等效 ${Math.round(focalLength35)}mm)`;
    }
    return fl;
  }
  return undefined;
}

function formatExifDate(dt: unknown): string | undefined {
  if (dt instanceof Date && !Number.isNaN(dt.getTime())) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof dt === 'string') {
    const match = dt.match(/^(\d{4})[:-](\d{2})[:-](\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
  }
  return undefined;
}

export async function extractPhotoExif(file: File): Promise<ExtractedExifResult> {
  try {
    const raw = await exifr.parse(file, [
      'Make',
      'Model',
      'LensModel',
      'FocalLength',
      'FocalLengthIn35mmFormat',
      'FNumber',
      'ExposureTime',
      'ISO',
      'DateTimeOriginal',
    ]);

    if (!raw || typeof raw !== 'object') {
      return { meta: {}, summary: '', hasData: false };
    }

    const camera = formatCameraName(raw.Make, raw.Model);
    const lens = formatLens(raw.LensModel, raw.FocalLength, raw.FocalLengthIn35mmFormat);
    const aperture = formatAperture(raw.FNumber);
    const shutter = formatShutter(raw.ExposureTime);
    const iso =
      typeof raw.ISO === 'number' && Number.isFinite(raw.ISO)
        ? String(Math.round(raw.ISO))
        : undefined;
    const dateStr = formatExifDate(raw.DateTimeOriginal);

    const meta: PhotoMeta = {
      ...(camera ? { camera } : {}),
      ...(lens ? { lens } : {}),
      ...(aperture ? { aperture } : {}),
      ...(shutter ? { shutter } : {}),
      ...(iso ? { iso } : {}),
    };

    const parts = [camera, lens, aperture, shutter, iso ? `ISO ${iso}` : undefined].filter(
      Boolean
    ) as string[];

    return {
      meta,
      dateStr,
      summary: parts.join(' · '),
      hasData: parts.length > 0 || Boolean(dateStr),
    };
  } catch {
    return { meta: {}, summary: '', hasData: false };
  }
}
