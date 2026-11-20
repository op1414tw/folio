import { EncryptedPayload, SensitiveWorkFields, WorkItem } from '../types';

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x2000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.byteLength; i += CHUNK_SIZE) {
    const sub = bytes.subarray(i, i + CHUNK_SIZE);
    parts.push(String.fromCharCode(...sub));
  }
  return btoa(parts.join(''));
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

async function getKeyMaterial(pin: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  if (!crypto?.subtle) {
    // Fallback deterministic hash for restricted non-secure contexts
    let h = 2166136261;
    const input = `${salt}:${pin}`;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `fallback_${(h >>> 0).toString(16)}`;
  }

  const keyMaterial = await getKeyMaterial(pin);
  const saltBytes = base64ToBytes(salt);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: 60000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return bytesToBase64(new Uint8Array(derivedBits));
}

export async function deriveAesKey(pin: string, salt: string): Promise<CryptoKey | null> {
  if (!crypto?.subtle) return null;
  const keyMaterial = await getKeyMaterial(pin);
  const saltBytes = base64ToBytes(salt);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: 60000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptFields(
  fields: SensitiveWorkFields,
  key: CryptoKey
): Promise<EncryptedPayload> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const enc = new TextEncoder();
  const data = enc.encode(JSON.stringify(fields));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    data
  );
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptFields(
  payload: EncryptedPayload,
  key: CryptoKey
): Promise<SensitiveWorkFields> {
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer
  );
  const dec = new TextDecoder();
  return JSON.parse(dec.decode(decrypted)) as SensitiveWorkFields;
}

export async function sealWorkItem(work: WorkItem, key: CryptoKey | null): Promise<WorkItem> {
  if (!work.isPrivate) return work;
  if (!key) {
    return {
      ...work,
      isSealed: true,
    };
  }

  const sensitive: SensitiveWorkFields = {
    title: work.title,
    subtitle: work.subtitle,
    content: work.content,
    imageData: work.imageData,
    photoMeta: work.photoMeta,
    writingGenre: work.writingGenre,
    chapters: work.chapters,
  };

  const encryptedPayload = await encryptFields(sensitive, key);
  return {
    ...work,
    title: '私密典藏作品',
    subtitle: undefined,
    content: '',
    imageData: undefined,
    photoMeta: undefined,
    chapters: undefined,
    isSealed: true,
    encryptedPayload,
  };
}

export async function unsealWorkItem(work: WorkItem, key: CryptoKey | null): Promise<WorkItem> {
  if (!work.isPrivate || !work.isSealed) return work;
  if (!work.encryptedPayload) {
    return {
      ...work,
      isSealed: false,
    };
  }
  if (!key) {
    return work;
  }
  try {
    const fields = await decryptFields(work.encryptedPayload, key);
    return {
      ...work,
      title: fields.title,
      subtitle: fields.subtitle,
      content: fields.content,
      imageData: fields.imageData,
      photoMeta: fields.photoMeta,
      writingGenre: fields.writingGenre,
      chapters: fields.chapters,
      isSealed: false,
    };
  } catch {
    // Keep item safely sealed if encrypted under a different key (e.g., restored external backup)
    return work;
  }
}
