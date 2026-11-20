export type WorkType = 'photography' | 'writing';

export type LayoutMode = 'masonry' | 'grid' | 'index' | 'magazine' | 'map';

export type ActiveTab = 'archive' | 'collections' | 'studio' | 'vault';

export interface PhotoMeta {
  camera?: string;
  lens?: string;
  film?: string;
  aperture?: string;
  shutter?: string;
  iso?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
}

export interface EncryptedPayload {
  iv: string;
  ciphertext: string;
}

export interface NovelChapter {
  id: string;
  title: string;
  content: string;
}

export interface SensitiveWorkFields {
  title: string;
  subtitle?: string;
  content: string;
  imageData?: string;
  photoMeta?: PhotoMeta;
  writingGenre?: string;
  chapters?: NovelChapter[];
}

export interface WorkItem {
  id: string;
  type: WorkType;
  title: string;
  subtitle?: string;
  content: string;
  imageData?: string;
  aspectRatio?: number; // width / height, e.g. 0.75 or 1.33
  collectionId: string;
  category?: string; // Sub-category belonging to the collection
  tags: string[];
  favorite: boolean;
  isPrivate: boolean;
  isSealed?: boolean; // true when stored encrypted & currently locked
  encryptedPayload?: EncryptedPayload;
  photoMeta?: PhotoMeta;
  writingGenre?: string;
  chapters?: NovelChapter[];
  useMarkdown?: boolean;
  createdAt: string; // YYYY-MM-DD
  updatedAt: number;
}

export type CollectionBannerMode =
  | 'auto-first'
  | 'auto-daily'
  | 'work-photo'
  | 'custom-upload';

export interface CollectionBannerConfig {
  mode: CollectionBannerMode;
  workId?: string;
  customImageData?: string;
  zoom?: number; // 1.0 - 2.5
  offsetX?: number; // -100 to 100 (%)
  offsetY?: number; // -100 to 100 (%)
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  categories?: string[];
  sortOrder?: number;
  banner?: CollectionBannerConfig;
  createdAt: number;
}

export type AddButtonPosition =
  | 'fab-right'
  | 'fab-left'
  | 'nav-left'
  | 'nav-center'
  | 'nav-right';

export interface AppSettings {
  theme: 'light' | 'dark';
  layout: LayoutMode;
  brandTitle: string;
  authorName: string;
  sealText: string;
  presetTags?: string[];
  customTags?: string[];
  defaultCollectionId?: string;
  defaultNewWorkType?: WorkType;
  defaultUntitledTitle?: string;
  defaultMarkdownEnabled?: boolean;
  savedShareTemplates?: SavedShareTemplate[];
  defaultShareTemplateId?: string;
  requireLockOnLaunch: boolean;
  hasPin: boolean;
  pinHash?: string;
  pinSalt?: string;
  lastBackupAt?: number;
  hasSeenWelcome?: boolean;
  devOptionsEnabled?: boolean;
  addButtonPosition?: AddButtonPosition;
  swipeTabNavigationEnabled?: boolean;
  conciseCopyMode?: boolean;
  minimalMode?: boolean;
  animationOverhaul?: boolean;
}

export interface BackupArchive {
  format: 'folio-archive-v1';
  exportedAt: string;
  authorName: string;
  collections: Collection[];
  works: WorkItem[];
}

export type ShareTemplateId = 'editorial' | 'polaroid' | 'darkroom' | 'postcard' | 'vertical';
export type ShareRatio = '3:4' | '1:1' | '9:16';
export type SharePhotoFit = 'contain' | 'cover';
export type SharePhotoAspect = 'original' | '4:3' | '3:2' | '1:1' | '16:9' | '3:4';
export type SharePhotoFrameStyle =
  | 'none'
  | 'hairline'
  | 'gallery-mat'
  | 'embossed'
  | 'film-border'
  | 'exif-caption';
export type ShareFontId =
  | 'editorial'
  | 'handwriting-pen'
  | 'handwriting-brush'
  | 'handwriting-note'
  | 'modern-sans';

export interface ShareConfig {
  template: ShareTemplateId;
  ratio: ShareRatio;
  fontFamily: ShareFontId;
  paperColor: string;
  textColor: string;
  accentColor: string;
  textAlign: 'left' | 'center';
  fontSize: number; // scale multiplier 0.8 - 1.4
  padding: number; // 40 - 120 px on 1080 canvas
  cornerRadius: number; // 0 - 32
  showDate: boolean;
  showMeta: boolean;
  showAuthor: boolean;
  showSeal: boolean;
  authorName: string;
  sealText: string;
  customTitle: string;
  customQuote: string;
  autoFlowLayout?: boolean;
  useMarkdown?: boolean;
  photoFit?: SharePhotoFit;
  photoAspect?: SharePhotoAspect;
  photoFrameStyle?: SharePhotoFrameStyle;
  photoZoom?: number; // 1.0 - 2.2
  photoOffsetX?: number; // -100 to 100 (%)
  photoOffsetY?: number; // -100 to 100 (%)
}

export interface SavedShareTemplate {
  id: string;
  name: string;
  createdAt: number;
  config: Omit<ShareConfig, 'authorName' | 'sealText' | 'customTitle' | 'customQuote'>;
}
