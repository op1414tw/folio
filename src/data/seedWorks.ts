import rainWindowImg from '../assets/images/photo_rain_window_1794802491318.jpg';
import coastalMistImg from '../assets/images/photo_coastal_mist_1794802491871.jpg';
import bookshopLightImg from '../assets/images/photo_bookshop_light_1794802492269.jpg';
import alleyLanternImg from '../assets/images/photo_alley_lantern_1794802493096.jpg';
import { Collection, WorkItem } from '../types';

export const SEED_COLLECTIONS: Collection[] = [
  {
    id: 'col_taipei_rain',
    name: '台北雨夜',
    description: '濕潤柏油路、咖啡館玻璃窗與藍調時刻的街景採集。',
    categories: ['街拍底片', '雨景隨筆'],
    createdAt: 1700000001000,
  },
  {
    id: 'col_coast_draft',
    name: '海岸線草稿',
    description: '海霧、潮汐與清晨無人防波堤的靜默觀察。',
    categories: ['清晨海霧', '詩作草稿'],
    createdAt: 1700000002000,
  },
  {
    id: 'col_desk_notes',
    name: '日常書桌與詩',
    description: '散落於紙頁邊緣的現代詩、隨筆與閱讀片刻。',
    categories: ['靜物光影', '暗房手記'],
    createdAt: 1700000003000,
  },
];

export const SEED_WORKS: WorkItem[] = [
  {
    id: 'work_photo_1',
    type: 'photography',
    title: '藍調時刻的雨窗',
    subtitle: 'Blue Hour Rain on Glass',
    content:
      '傍晚五點四十分，暴雨剛過，玻璃窗上的水珠把整條街的車燈拆解成溫暖的散景。坐在靠窗角落的人低頭啜飲黑咖啡，時間在霧氣裡慢了半拍。',
    imageData: rainWindowImg,
    aspectRatio: 0.75,
    collectionId: 'col_taipei_rain',
    category: '街拍底片',
    tags: ['夜色', '藍調時刻', '底片'],
    favorite: true,
    isPrivate: false,
    photoMeta: {
      camera: 'Leica M6',
      lens: '35mm Summicron',
      film: 'CineStill 800T',
      aperture: 'f/2.0',
      shutter: '1/60s',
      iso: '800',
      location: '台北 · 大安區',
      latitude: 25.033,
      longitude: 121.5434,
    },
    createdAt: '2026-10-18',
    updatedAt: 1760745600000,
  },
  {
    id: 'work_writing_1',
    type: 'writing',
    title: '給十月海霧的備忘錄',
    subtitle: '現代詩 · 四行與留白',
    writingGenre: '現代詩',
    content: `我們把夏末剩餘的鹽分
折進未寄出的明信片裡。

潮水退去之後
沙灘只留下風的字跡
而防波堤依然沉默，像一句
還沒準備好被讀出的詩。

如果明天清晨仍有霧
請替我記下海平線消失的時刻。`,
    collectionId: 'col_coast_draft',
    category: '詩作草稿',
    tags: ['現代詩', '自然', '靈感'],
    favorite: true,
    isPrivate: false,
    createdAt: '2026-10-14',
    updatedAt: 1760400000000,
  },
  {
    id: 'work_photo_2',
    type: 'photography',
    title: '晨霧消波塊',
    subtitle: 'Quiet Horizon at Dawn',
    content:
      '清晨六點零五分，海面與天空之間幾乎找不到分界線。只有遠處那排灰黑色的消波塊，替這片銀白色的寧靜標出了一個句點。',
    imageData: coastalMistImg,
    aspectRatio: 1.33,
    collectionId: 'col_coast_draft',
    category: '清晨海霧',
    tags: ['自然', '底片', '旅行'],
    favorite: false,
    isPrivate: false,
    photoMeta: {
      camera: 'Hasselblad 500C/M',
      lens: '80mm Planar',
      film: 'Ilford Delta 400',
      aperture: 'f/8',
      shutter: '1/125s',
      iso: '400',
      location: '花蓮 · 七星潭',
      latitude: 24.0315,
      longitude: 121.6294,
    },
    createdAt: '2026-10-09',
    updatedAt: 1759968000000,
  },
  {
    id: 'work_photo_3',
    type: 'photography',
    title: '舊書店木窗斜影',
    subtitle: 'Morning Light in the Bookshop',
    content:
      '十點半的斜陽穿過老式木窗格，剛好落在翻開的手寫筆記與粗陶茶杯之間。喜歡紙張被光線曬得微微發暖的氣味。',
    imageData: bookshopLightImg,
    aspectRatio: 1.33,
    collectionId: 'col_desk_notes',
    category: '靜物光影',
    tags: ['日常', '書桌', '底片'],
    favorite: true,
    isPrivate: false,
    photoMeta: {
      camera: 'Nikon FM2',
      lens: '50mm f/1.4',
      film: 'Kodak Portra 400',
      aperture: 'f/2.8',
      shutter: '1/250s',
      iso: '400',
      location: '台南 · 中西區',
      latitude: 22.9926,
      longitude: 120.1983,
    },
    createdAt: '2026-09-28',
    updatedAt: 1759017600000,
  },
  {
    id: 'work_writing_2',
    type: 'writing',
    title: '論雨後巷弄的聲響結構',
    subtitle: '城市觀察隨筆',
    writingGenre: '散文隨筆',
    content: `每次陣雨剛歇，老城區的窄巷總會出現一種奇特的回聲。先是屋簷鐵皮滴水的慢板，間隔約莫兩秒一聲，像某種不急不徐的節拍器；接著是機車遠去時輪胎輾過積水的沙沙聲，在石板牆之間反彈兩次後消散。

人往往在這樣濕涼的黃昏裡，才忽然想起那些被忙碌日常折疊起來的舊事。一盞亮在轉角的紙燈籠，足以讓一整段無名的石階變得值得多走一趟。`,
    collectionId: 'col_taipei_rain',
    category: '雨景隨筆',
    tags: ['散文', '街拍', '日常'],
    favorite: false,
    isPrivate: false,
    createdAt: '2026-09-21',
    updatedAt: 1758412800000,
  },
  {
    id: 'work_photo_4',
    type: 'photography',
    title: '石板巷燈籠微光',
    subtitle: 'Lantern Glow After Rain',
    content:
      '天色將暗未暗時，木屋簷下第一盞燈籠點亮，濕漉漉的石板路隨即映出一道柔黃的水影。',
    imageData: alleyLanternImg,
    aspectRatio: 0.75,
    collectionId: 'col_taipei_rain',
    category: '街拍底片',
    tags: ['夜色', '街拍', '旅行'],
    favorite: false,
    isPrivate: false,
    photoMeta: {
      camera: 'Fujifilm X-Pro3',
      lens: '23mm f/1.4',
      film: 'Classic Neg',
      aperture: 'f/1.8',
      shutter: '1/45s',
      iso: '1600',
      location: '台北 · 迪化街',
      latitude: 25.056,
      longitude: 121.5097,
    },
    createdAt: '2026-09-12',
    updatedAt: 1757635200000,
  },
  {
    id: 'work_writing_3',
    type: 'writing',
    title: '關於膠捲與記憶的保存期限',
    subtitle: '暗房手記',
    writingGenre: '手記',
    content: `數位影像總是太過精確，精確到連空氣裡的猶豫都被銳化得一清二楚。

底片則相反，它允許輕微的失焦、允許高光邊緣柔和地暈開，就像人類回憶的方式——我們記住的從來不是現場每一粒像素，而是那天下午光線落在某人肩上的溫度。`,
    collectionId: 'col_desk_notes',
    category: '暗房手記',
    tags: ['底片', '靈感', '日常'],
    favorite: true,
    isPrivate: false,
    createdAt: '2026-09-03',
    updatedAt: 1756857600000,
  },
];
