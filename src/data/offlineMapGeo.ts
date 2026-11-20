/**
 * 100% Offline GeoJSON Vector Dataset for Folio Offline Map.
 * Embedded directly in project — ZERO external fetch / CDN requests.
 *
 * NOTE on D3 spherical winding:
 * All exterior polygon rings are wound clockwise in [lon, lat] screen orientation
 * (negative 2D shoelace area => spherical area < 2π) so d3.geoPath renders
 * landmasses rather than inverted global complements.
 */

export interface GeoFeature {
  type: 'Feature';
  properties: {
    name: string;
    nameZh: string;
    isPrimary?: boolean;
    region?: string;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

export interface GeoCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

/**
 * Ensures a coordinate ring has clockwise winding in [lon, lat] space,
 * matching D3's spherical polygon convention for small landmasses (< hemisphere).
 */
function clockwiseRing(ring: number[][]): number[][] {
  if (ring.length < 4) return ring;
  let signedArea = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    signedArea += x1 * y2 - x2 * y1;
  }
  // In standard Cartesian [lon, lat], clockwise has signedArea < 0.
  return signedArea > 0 ? [...ring].reverse() : ring;
}

function makePolygon(
  name: string,
  nameZh: string,
  ring: number[][],
  isPrimary = false,
  region = 'Global'
): GeoFeature {
  return {
    type: 'Feature',
    properties: { name, nameZh, isPrimary, region },
    geometry: {
      type: 'Polygon',
      coordinates: [clockwiseRing(ring)],
    },
  };
}

function makeMultiPolygon(
  name: string,
  nameZh: string,
  rings: number[][][],
  isPrimary = false,
  region = 'Global'
): GeoFeature {
  return {
    type: 'Feature',
    properties: { name, nameZh, isPrimary, region },
    geometry: {
      type: 'MultiPolygon',
      coordinates: rings.map((r) => [clockwiseRing(r)]),
    },
  };
}

export const OFFLINE_WORLD_AND_TAIWAN_GEOJSON: GeoCollection = {
  type: 'FeatureCollection',
  features: [
    // 1. Global Continents (drawn first so regional details layer cleanly)
    makePolygon(
      'Eurasia & Mainland Asia',
      '歐亞大陸',
      [
        [28.0, 41.0],
        [36.0, 45.0],
        [45.0, 66.0],
        [80.0, 72.0],
        [135.0, 70.0],
        [170.0, 65.0],
        [162.0, 54.0],
        [142.0, 53.0],
        [135.0, 44.0],
        [128.5, 40.5],
        [124.0, 39.8],
        [121.5, 38.9],
        [118.0, 39.0],
        [122.2, 37.2],
        [120.2, 35.8],
        [121.8, 31.3],
        [121.5, 29.5],
        [120.6, 27.8],
        [119.6, 26.0],
        [118.6, 24.7],
        [117.2, 23.6],
        [114.2, 22.3],
        [110.5, 20.5],
        [108.5, 21.3],
        [109.2, 12.0],
        [104.0, 10.0],
        [103.8, 1.3], // Singapore / Malay Peninsula
        [100.0, 6.0],
        [98.0, 15.0],
        [91.0, 22.0],
        [80.0, 13.0],
        [77.5, 8.1], // South India
        [72.8, 19.0],
        [67.0, 24.8],
        [56.0, 25.5],
        [58.5, 22.0],
        [45.0, 12.8],
        [34.5, 28.0],
        [36.0, 36.5],
        [28.0, 41.0],
      ],
      false,
      'Global'
    ),

    makePolygon(
      'Europe & Mediterranean',
      '歐洲大陸',
      [
        [-9.5, 37.0],
        [-9.2, 43.0],
        [-1.8, 43.4],
        [-4.6, 48.4],
        [1.5, 50.8],
        [6.5, 53.6],
        [9.0, 57.2],
        [12.0, 58.0],
        [5.5, 61.0],
        [15.0, 68.5],
        [28.0, 70.5],
        [30.0, 60.0],
        [24.0, 59.5],
        [20.5, 54.8],
        [14.0, 54.0],
        [28.5, 45.0],
        [29.0, 41.2],
        [23.7, 38.0],
        [18.0, 40.0],
        [15.6, 38.0],
        [12.5, 41.8],
        [8.5, 44.3],
        [3.1, 42.4],
        [-0.4, 39.0],
        [-5.6, 36.0],
        [-9.5, 37.0],
      ],
      false,
      'Global'
    ),

    makePolygon(
      'British Isles',
      '不列顛群島',
      [
        [-5.5, 50.1],
        [-5.2, 54.8],
        [-5.8, 58.5],
        [-2.0, 57.7],
        [1.7, 52.5],
        [1.3, 51.1],
        [-5.5, 50.1],
      ],
      false,
      'Global'
    ),

    makePolygon(
      'Iceland',
      '冰島',
      [
        [-24.0, 65.0],
        [-18.0, 66.4],
        [-13.6, 65.1],
        [-19.2, 63.4],
        [-24.0, 65.0],
      ],
      false,
      'Global'
    ),

    makePolygon(
      'Africa',
      '非洲大陸',
      [
        [-5.8, 35.8],
        [10.0, 37.0],
        [32.5, 31.2],
        [43.0, 12.0],
        [51.2, 11.8],
        [40.0, -4.0],
        [35.0, -24.0],
        [20.0, -34.8],
        [14.5, -22.0],
        [9.0, 4.0],
        [-15.0, 11.0],
        [-17.4, 14.7],
        [-12.0, 26.0],
        [-5.8, 35.8],
      ],
      false,
      'Global'
    ),

    makePolygon(
      'North America',
      '北美洲',
      [
        [-165.0, 60.0],
        [-155.0, 71.0],
        [-95.0, 70.0],
        [-60.0, 53.0],
        [-66.5, 44.5],
        [-74.0, 40.7],
        [-80.2, 25.8],
        [-82.5, 29.5],
        [-97.0, 26.0],
        [-96.0, 19.0],
        [-87.0, 21.0],
        [-80.0, 9.0],
        [-105.0, 20.0],
        [-117.2, 32.5],
        [-122.5, 37.8],
        [-124.5, 48.4],
        [-137.0, 58.5],
        [-165.0, 60.0],
      ],
      false,
      'Global'
    ),

    makePolygon(
      'South America',
      '南美洲',
      [
        [-79.0, 9.5],
        [-62.0, 10.5],
        [-50.0, 1.5],
        [-35.0, -6.0],
        [-40.0, -21.0],
        [-53.0, -34.0],
        [-67.5, -55.0],
        [-74.5, -52.0],
        [-71.5, -33.0],
        [-70.5, -18.0],
        [-81.0, -5.0],
        [-79.0, 9.5],
      ],
      false,
      'Global'
    ),

    makeMultiPolygon(
      'Australia & New Zealand',
      '大洋洲',
      [
        // Australia
        [
          [114.0, -22.0],
          [129.0, -14.5],
          [142.5, -10.8],
          [153.5, -28.0],
          [149.8, -37.5],
          [138.0, -35.5],
          [124.0, -33.5],
          [115.0, -34.0],
          [114.0, -22.0],
        ],
        // New Zealand
        [
          [174.0, -35.5],
          [178.0, -37.8],
          [172.0, -43.5],
          [166.8, -46.2],
          [171.0, -41.5],
          [174.0, -35.5],
        ],
      ],
      false,
      'Global'
    ),

    // 2. Surrounding East & Southeast Asia Detail
    makeMultiPolygon(
      'East Asia Islands & Peninsula',
      '東亞島弧與半島',
      [
        // Korean Peninsula
        [
          [124.5, 39.8],
          [128.5, 40.5],
          [129.4, 35.2],
          [126.3, 34.6],
          [126.5, 37.6],
          [124.5, 39.8],
        ],
        // Kyushu & Honshu & Shikoku
        [
          [129.8, 33.2],
          [131.0, 34.1],
          [135.4, 35.7],
          [138.8, 37.6],
          [140.4, 41.3],
          [141.5, 40.8],
          [140.9, 36.8],
          [139.8, 35.2],
          [135.5, 34.4],
          [132.2, 33.2],
          [131.4, 31.3],
          [130.1, 31.3],
          [129.8, 33.2],
        ],
        // Hokkaido
        [
          [140.2, 41.6],
          [141.9, 45.4],
          [145.5, 43.3],
          [143.2, 42.0],
          [140.2, 41.6],
        ],
        // Okinawa / Ryukyu Islands
        [
          [127.62, 26.18],
          [128.25, 26.82],
          [128.34, 26.68],
          [127.76, 26.08],
          [127.62, 26.18],
        ],
        [
          [123.75, 24.35],
          [124.25, 24.48],
          [124.25, 24.30],
          [123.75, 24.22],
          [123.75, 24.35],
        ],
        // Hainan Island
        [
          [108.6, 19.3],
          [110.3, 20.1],
          [111.0, 19.6],
          [109.5, 18.2],
          [108.6, 19.3],
        ],
        // Luzon (Philippines)
        [
          [119.9, 16.0],
          [120.7, 18.5],
          [122.3, 18.4],
          [122.5, 15.6],
          [121.0, 14.3],
          [119.9, 16.0],
        ],
      ],
      false,
      'AsiaContext'
    ),

    // 3. Taiwan & Offshore Islands (Primary Archival Focus)
    makePolygon(
      'Taiwan Main Island',
      '台灣本島',
      [
        [121.53, 25.29], // Fugui Cape
        [121.66, 25.22], // Jinshan
        [121.75, 25.15], // Keelung
        [121.93, 25.01], // Sandiaojiao
        [121.84, 24.83], // Toucheng
        [121.84, 24.67], // Yilan Coast
        [121.87, 24.58], // Su'ao
        [121.76, 24.32], // Heping
        [121.66, 24.16], // Taroko
        [121.63, 24.03], // Qixingtan / Hualien
        [121.58, 23.75], // Fengbin
        [121.51, 23.48], // Shitiping
        [121.40, 23.10], // Chenggong
        [121.18, 22.75], // Taitung
        [121.01, 22.58], // Taimali
        [120.90, 22.35], // Dawu
        [120.89, 22.06], // Manzhou
        [120.85, 21.90], // Eluanbi
        [120.74, 21.95], // Kenting
        [120.70, 22.00], // Maobitou
        [120.69, 22.25], // Checheng
        [120.59, 22.37], // Fangliao
        [120.44, 22.46], // Donggang
        [120.26, 22.62], // Kaohsiung Port
        [120.19, 22.88], // Qieding
        [120.14, 23.00], // Anping / Tainan
        [120.06, 23.16], // Qigu
        [120.10, 23.36], // Beimen
        [120.14, 23.58], // Dongshi
        [120.17, 23.79], // Mailiao
        [120.34, 24.06], // Lukang
        [120.50, 24.28], // Taichung Port
        [120.64, 24.46], // Tongxiao
        [120.83, 24.68], // Zhunan
        [120.92, 24.84], // Hsinchu Nanliao
        [121.04, 24.97], // Xinwu
        [121.22, 25.11], // Dayuan
        [121.41, 25.18], // Tamsui
        [121.53, 25.29], // Close loop
      ],
      true,
      'Taiwan'
    ),

    makeMultiPolygon(
      'Penghu Islands',
      '澎湖群島',
      [
        [
          [119.55, 23.66],
          [119.65, 23.66],
          [119.67, 23.57],
          [119.58, 23.52],
          [119.50, 23.58],
          [119.55, 23.66],
        ],
        [
          [119.41, 23.23],
          [119.45, 23.23],
          [119.45, 23.20],
          [119.41, 23.20],
          [119.41, 23.23],
        ],
        [
          [119.49, 23.38],
          [119.53, 23.38],
          [119.53, 23.35],
          [119.49, 23.35],
          [119.49, 23.38],
        ],
      ],
      true,
      'Penghu'
    ),

    makePolygon(
      'Green Island',
      '綠島',
      [
        [121.47, 22.68],
        [121.51, 22.68],
        [121.51, 22.64],
        [121.47, 22.64],
        [121.47, 22.68],
      ],
      true,
      'Taitung'
    ),

    makePolygon(
      'Orchid Island',
      '蘭嶼',
      [
        [121.52, 22.08],
        [121.59, 22.08],
        [121.59, 22.01],
        [121.52, 22.01],
        [121.52, 22.08],
      ],
      true,
      'Taitung'
    ),

    makePolygon(
      'Kinmen',
      '金門',
      [
        [118.28, 24.50],
        [118.45, 24.52],
        [118.48, 24.44],
        [118.38, 24.40],
        [118.26, 24.42],
        [118.28, 24.50],
      ],
      true,
      'Kinmen'
    ),

    makePolygon(
      'Matsu',
      '馬祖',
      [
        [119.90, 26.18],
        [119.98, 26.22],
        [119.98, 26.15],
        [119.90, 26.15],
        [119.90, 26.18],
      ],
      true,
      'Matsu'
    ),
  ],
};
