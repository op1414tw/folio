import { WorkItem } from '../types';

export interface ResolvedGeoLocation {
  latitude: number;
  longitude: number;
  placeName: string;
  region: string;
}

export type MacroRegionKey =
  | 'north-tw'
  | 'central-tw'
  | 'south-tw'
  | 'east-tw'
  | 'islands-tw'
  | 'overseas';

export interface MacroRegionMeta {
  key: MacroRegionKey;
  label: string;
  subtitle: string;
  order: number;
}

export const MACRO_REGIONS: MacroRegionMeta[] = [
  { key: 'north-tw', label: '北台灣', subtitle: '基隆 · 台北 · 新北 · 桃園 · 新竹', order: 1 },
  { key: 'central-tw', label: '中台灣', subtitle: '苗栗 · 台中 · 彰化 · 南投 · 雲林', order: 2 },
  { key: 'south-tw', label: '南台灣', subtitle: '嘉義 · 台南 · 高雄 · 屏東', order: 3 },
  { key: 'east-tw', label: '東台灣', subtitle: '宜蘭 · 花蓮 · 台東', order: 4 },
  { key: 'islands-tw', label: '台灣離島', subtitle: '澎湖 · 金門 · 馬祖 · 綠島 · 蘭嶼', order: 5 },
  { key: 'overseas', label: '海外足跡', subtitle: '東亞 · 歐美 · 大洋洲', order: 6 },
];

const REGION_TO_MACRO: Record<string, MacroRegionKey> = {
  台北: 'north-tw',
  新北: 'north-tw',
  基隆: 'north-tw',
  桃園: 'north-tw',
  新竹: 'north-tw',
  苗栗: 'central-tw',
  台中: 'central-tw',
  彰化: 'central-tw',
  南投: 'central-tw',
  雲林: 'central-tw',
  嘉義: 'south-tw',
  台南: 'south-tw',
  高雄: 'south-tw',
  屏東: 'south-tw',
  宜蘭: 'east-tw',
  花蓮: 'east-tw',
  台東: 'east-tw',
  澎湖: 'islands-tw',
  金門: 'islands-tw',
  馬祖: 'islands-tw',
  離島: 'islands-tw',
};

/**
 * 100% Offline Geocoding Dictionary.
 * Maps city, district, landscape, and country names directly to coordinates.
 */
export const OFFLINE_GEO_DICTIONARY: Record<
  string,
  { lat: number; lng: number; region: string }
> = {
  // Taipei
  大安區: { lat: 25.033, lng: 121.5434, region: '台北' },
  大安: { lat: 25.033, lng: 121.5434, region: '台北' },
  迪化街: { lat: 25.056, lng: 121.5097, region: '台北' },
  大稻埕: { lat: 25.055, lng: 121.509, region: '台北' },
  信義區: { lat: 25.033, lng: 121.5654, region: '台北' },
  信義: { lat: 25.033, lng: 121.5654, region: '台北' },
  中山區: { lat: 25.062, lng: 121.526, region: '台北' },
  中山: { lat: 25.062, lng: 121.526, region: '台北' },
  萬華: { lat: 25.036, lng: 121.499, region: '台北' },
  西門町: { lat: 25.042, lng: 121.508, region: '台北' },
  北投: { lat: 25.132, lng: 121.498, region: '台北' },
  陽明山: { lat: 25.155, lng: 121.548, region: '台北' },
  士林: { lat: 25.092, lng: 121.524, region: '台北' },
  松山: { lat: 25.059, lng: 121.557, region: '台北' },
  台北市: { lat: 25.033, lng: 121.5654, region: '台北' },
  臺北市: { lat: 25.033, lng: 121.5654, region: '台北' },
  台北: { lat: 25.033, lng: 121.5654, region: '台北' },
  臺北: { lat: 25.033, lng: 121.5654, region: '台北' },

  // New Taipei & Keelung
  淡水: { lat: 25.17, lng: 121.443, region: '新北' },
  九份: { lat: 25.109, lng: 121.844, region: '新北' },
  金瓜石: { lat: 25.115, lng: 121.858, region: '新北' },
  瑞芳: { lat: 25.108, lng: 121.808, region: '新北' },
  烏來: { lat: 24.865, lng: 121.551, region: '新北' },
  板橋: { lat: 25.011, lng: 121.463, region: '新北' },
  三峽: { lat: 24.933, lng: 121.371, region: '新北' },
  鶯歌: { lat: 24.954, lng: 121.355, region: '新北' },
  新北市: { lat: 25.011, lng: 121.463, region: '新北' },
  新北: { lat: 25.011, lng: 121.463, region: '新北' },
  基隆市: { lat: 25.1276, lng: 121.7392, region: '基隆' },
  基隆: { lat: 25.1276, lng: 121.7392, region: '基隆' },

  // Yilan & Hualien
  七星潭: { lat: 24.0315, lng: 121.6294, region: '花蓮' },
  花蓮市: { lat: 23.9871, lng: 121.6015, region: '花蓮' },
  花蓮: { lat: 23.9871, lng: 121.6015, region: '花蓮' },
  太魯閣: { lat: 24.159, lng: 121.622, region: '花蓮' },
  豐濱: { lat: 23.597, lng: 121.517, region: '花蓮' },
  石梯坪: { lat: 23.488, lng: 121.512, region: '花蓮' },
  瑞穗: { lat: 23.497, lng: 121.377, region: '花蓮' },
  宜蘭市: { lat: 24.757, lng: 121.753, region: '宜蘭' },
  宜蘭: { lat: 24.757, lng: 121.753, region: '宜蘭' },
  礁溪: { lat: 24.828, lng: 121.772, region: '宜蘭' },
  羅東: { lat: 24.677, lng: 121.767, region: '宜蘭' },
  蘇澳: { lat: 24.595, lng: 121.85, region: '宜蘭' },

  // Taoyuan, Hsinchu, Miaoli
  桃園市: { lat: 24.993, lng: 121.301, region: '桃園' },
  桃園: { lat: 24.993, lng: 121.301, region: '桃園' },
  大溪: { lat: 24.882, lng: 121.287, region: '桃園' },
  中壢: { lat: 24.958, lng: 121.224, region: '桃園' },
  新竹市: { lat: 24.803, lng: 120.968, region: '新竹' },
  新竹: { lat: 24.803, lng: 120.968, region: '新竹' },
  北埔: { lat: 24.698, lng: 121.057, region: '新竹' },
  苗栗: { lat: 24.56, lng: 120.82, region: '苗栗' },
  南庄: { lat: 24.599, lng: 120.999, region: '苗栗' },
  三義: { lat: 24.382, lng: 120.768, region: '苗栗' },

  // Central Taiwan
  台中市: { lat: 24.1477, lng: 120.6736, region: '台中' },
  臺中市: { lat: 24.1477, lng: 120.6736, region: '台中' },
  台中: { lat: 24.1477, lng: 120.6736, region: '台中' },
  臺中: { lat: 24.1477, lng: 120.6736, region: '台中' },
  高美濕地: { lat: 24.312, lng: 120.55, region: '台中' },
  清水: { lat: 24.269, lng: 120.56, region: '台中' },
  審計新村: { lat: 24.147, lng: 120.663, region: '台中' },
  彰化: { lat: 24.081, lng: 120.538, region: '彰化' },
  鹿港: { lat: 24.056, lng: 120.435, region: '彰化' },
  南投: { lat: 23.903, lng: 120.686, region: '南投' },
  日月潭: { lat: 23.858, lng: 120.916, region: '南投' },
  清境: { lat: 24.058, lng: 121.162, region: '南投' },
  阿里山: { lat: 23.51, lng: 120.803, region: '嘉義' },
  雲林: { lat: 23.709, lng: 120.544, region: '雲林' },
  虎尾: { lat: 23.71, lng: 120.432, region: '雲林' },
  嘉義市: { lat: 23.48, lng: 120.449, region: '嘉義' },
  嘉義: { lat: 23.48, lng: 120.449, region: '嘉義' },

  // Tainan & Kaohsiung & Pingtung
  中西區: { lat: 22.9926, lng: 120.1983, region: '台南' },
  安平: { lat: 22.998, lng: 120.163, region: '台南' },
  台南市: { lat: 22.9997, lng: 120.227, region: '台南' },
  臺南市: { lat: 22.9997, lng: 120.227, region: '台南' },
  台南: { lat: 22.9997, lng: 120.227, region: '台南' },
  臺南: { lat: 22.9997, lng: 120.227, region: '台南' },
  七股: { lat: 23.143, lng: 120.101, region: '台南' },
  北門: { lat: 23.267, lng: 120.125, region: '台南' },
  高雄市: { lat: 22.6273, lng: 120.3014, region: '高雄' },
  高雄: { lat: 22.6273, lng: 120.3014, region: '高雄' },
  鹽埕: { lat: 22.625, lng: 120.283, region: '高雄' },
  駁二: { lat: 22.619, lng: 120.281, region: '高雄' },
  旗津: { lat: 22.614, lng: 120.267, region: '高雄' },
  屏東: { lat: 22.676, lng: 120.488, region: '屏東' },
  恆春: { lat: 22.004, lng: 120.744, region: '屏東' },
  墾丁: { lat: 21.946, lng: 120.796, region: '屏東' },
  鵝鑾鼻: { lat: 21.902, lng: 120.853, region: '屏東' },
  小琉球: { lat: 22.345, lng: 120.37, region: '離島' },

  // Taitung & Offshore Islands
  台東市: { lat: 22.7583, lng: 121.1444, region: '台東' },
  台東: { lat: 22.7583, lng: 121.1444, region: '台東' },
  臺東: { lat: 22.7583, lng: 121.1444, region: '台東' },
  池上: { lat: 23.123, lng: 121.218, region: '台東' },
  成功: { lat: 23.104, lng: 121.378, region: '台東' },
  綠島: { lat: 22.663, lng: 121.493, region: '離島' },
  蘭嶼: { lat: 22.046, lng: 121.554, region: '離島' },
  澎湖: { lat: 23.5711, lng: 119.5793, region: '澎湖' },
  馬公: { lat: 23.565, lng: 119.58, region: '澎湖' },
  金門: { lat: 24.449, lng: 118.376, region: '金門' },
  馬祖: { lat: 26.155, lng: 119.93, region: '馬祖' },

  // Global / International
  東京: { lat: 35.6762, lng: 139.6503, region: '日本' },
  京都: { lat: 35.0116, lng: 135.7681, region: '日本' },
  大阪: { lat: 34.6937, lng: 135.5023, region: '日本' },
  沖繩: { lat: 26.2124, lng: 127.6809, region: '日本' },
  北海道: { lat: 43.0642, lng: 141.3469, region: '日本' },
  首爾: { lat: 37.5665, lng: 126.978, region: '韓國' },
  香港: { lat: 22.3193, lng: 114.1694, region: '香港' },
  澳門: { lat: 22.1987, lng: 113.5439, region: '澳門' },
  新加坡: { lat: 1.3521, lng: 103.8198, region: '新加坡' },
  曼谷: { lat: 13.7563, lng: 100.5018, region: '泰國' },
  巴黎: { lat: 48.8566, lng: 2.3522, region: '法國' },
  倫敦: { lat: 51.5074, lng: -0.1278, region: '英國' },
  紐約: { lat: 40.7128, lng: -74.006, region: '美國' },
  舊金山: { lat: 37.7749, lng: -122.4194, region: '美國' },
  溫哥華: { lat: 49.2827, lng: -123.1207, region: '加拿大' },
  冰島: { lat: 64.9631, lng: -19.0208, region: '冰島' },
  柏林: { lat: 52.52, lng: 13.405, region: '德國' },
  羅馬: { lat: 41.9028, lng: 12.4964, region: '義大利' },
  阿姆斯特丹: { lat: 52.3676, lng: 4.9041, region: '荷蘭' },
  蘇黎世: { lat: 47.3769, lng: 8.5417, region: '瑞士' },
  雪梨: { lat: -33.8688, lng: 151.2093, region: '澳洲' },
  墨爾本: { lat: -37.8136, lng: 144.9631, region: '澳洲' },
};

// Pre-sorted keys by length descending so specific names match before general cities
const SORTED_DICTIONARY_ENTRIES = Object.entries(OFFLINE_GEO_DICTIONARY).sort(
  (a, b) => b[0].length - a[0].length
);

/**
 * Classifies a ResolvedGeoLocation into a major regional group for list grouping.
 */
export function getMacroRegion(geo: ResolvedGeoLocation): MacroRegionKey {
  // 1. Check offshore island place names first (even if region says 台東/屏東)
  if (
    geo.placeName.includes('綠島') ||
    geo.placeName.includes('蘭嶼') ||
    geo.placeName.includes('小琉球') ||
    geo.placeName.includes('澎湖') ||
    geo.placeName.includes('金門') ||
    geo.placeName.includes('馬祖')
  ) {
    return 'islands-tw';
  }

  // 2. Direct lookup by region name
  if (REGION_TO_MACRO[geo.region]) {
    return REGION_TO_MACRO[geo.region];
  }

  // 3. Match against dictionary keywords inside placeName / region
  const combined = `${geo.region} ${geo.placeName}`;
  for (const [key, data] of SORTED_DICTIONARY_ENTRIES) {
    if (combined.includes(key) && REGION_TO_MACRO[data.region]) {
      return REGION_TO_MACRO[data.region];
    }
  }

  // 4. Coordinate bounding fallback
  const { latitude: lat, longitude: lng } = geo;
  if (lat >= 21.8 && lat <= 26.4 && lng >= 118.0 && lng <= 122.2) {
    // Kinmen / Matsu / Penghu boxes
    if (lng < 119.8) return 'islands-tw';
    // Eastern Taiwan
    if (lng >= 121.35 && lat < 24.95) return 'east-tw';
    if (lat >= 24.45) return 'north-tw';
    if (lat >= 23.58) return 'central-tw';
    return 'south-tw';
  }

  return 'overseas';
}

/**
 * Extracts and resolves geographic coordinates for a given WorkItem.
 * Returns null if no location can be established.
 */
export function resolveWorkGeoLocation(work: WorkItem): ResolvedGeoLocation | null {
  const meta = work.photoMeta;

  // 1. Explicit numeric coordinates in photoMeta
  if (
    meta &&
    typeof meta.latitude === 'number' &&
    typeof meta.longitude === 'number' &&
    !isNaN(meta.latitude) &&
    !isNaN(meta.longitude) &&
    meta.latitude >= -90 &&
    meta.latitude <= 90 &&
    meta.longitude >= -180 &&
    meta.longitude <= 180
  ) {
    const placeName = meta.location || work.title || '攝影地標';
    let resolvedRegion = placeName.includes('·') ? placeName.split('·')[0].trim() : '';
    if (!resolvedRegion) {
      for (const [key, data] of SORTED_DICTIONARY_ENTRIES) {
        if (placeName.includes(key)) {
          resolvedRegion = data.region;
          break;
        }
      }
    }
    return {
      latitude: meta.latitude,
      longitude: meta.longitude,
      placeName,
      region: resolvedRegion || '攝影地點',
    };
  }

  // 2. Parse coordinate string (e.g. "25.033, 121.543" or "25.033°N, 121.543°E")
  const rawLoc = meta?.location || '';
  if (rawLoc) {
    const coordMatch = rawLoc.match(/(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return {
          latitude: lat,
          longitude: lng,
          placeName: rawLoc,
          region: '座標標記',
        };
      }
    }
  }

  // 3. Match from offline dictionary against photoMeta.location, title, tags
  const candidates = [
    rawLoc,
    ...rawLoc.split(/[·,\s/]+/),
    work.title,
    ...(work.tags || []),
    work.subtitle || '',
  ].filter(Boolean);

  for (const text of candidates) {
    const trimmed = text.trim();
    if (!trimmed) continue;

    // Direct key match
    if (OFFLINE_GEO_DICTIONARY[trimmed]) {
      const match = OFFLINE_GEO_DICTIONARY[trimmed];
      return {
        latitude: match.lat,
        longitude: match.lng,
        placeName: rawLoc || trimmed,
        region: match.region,
      };
    }

    // Substring match (prefer longest dictionary key contained in candidate)
    for (const [key, data] of SORTED_DICTIONARY_ENTRIES) {
      if (trimmed.includes(key) || (trimmed.length >= 2 && key.includes(trimmed))) {
        return {
          latitude: data.lat,
          longitude: data.lng,
          placeName: rawLoc || key,
          region: data.region,
        };
      }
    }
  }

  return null;
}
