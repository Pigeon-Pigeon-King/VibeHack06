import { LoadingManager } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ModelLoader, ModelLoadProgress } from './model-contracts';
import { disposeModelTemplate } from './model-disposal';

export const modelAbortError = (): DOMException => new DOMException('模型加载已取消。', 'AbortError');
const checkAbort = (signal: AbortSignal): void => { if (signal.aborted) throw modelAbortError(); };
class HttpError extends Error {
  constructor(readonly status: number) { super(`模型下载失败（HTTP ${status}），可以重试。`); }
}

function localUrl(url: string): string {
  if (!url.trim() || /[\\\u0000-\u0020]/.test(url)) throw new Error('模型地址必须是项目内资源 URL。');
  const documentBase = typeof document !== 'undefined' ? document.baseURI : undefined;
  const pageUrl = typeof location !== 'undefined' ? location.href : documentBase;
  const base = documentBase || pageUrl;
  // A browser always has a page URL. Keeping relative URLs here also allows a
  // fetch-injected, DOM-free loader test without inventing a trusted origin.
  if (!pageUrl && !base && !/^[a-z][a-z\d+.-]*:/i.test(url) && !url.startsWith('//')) return url;
  if (!pageUrl) throw new Error('模型必须使用本项目同源资源，不允许外部下载地址。');
  const page = new URL(pageUrl), resolved = new URL(url, base);
  if (resolved.username || resolved.password) throw new Error('模型地址不允许包含登录凭据。');
  const web = ['http:', 'https:'].includes(page.protocol)
    && ['http:', 'https:'].includes(resolved.protocol) && page.origin === resolved.origin;
  // Electron's registered game scheme has an opaque ("null") URL.origin.
  // Never equate opaque origins: only this exact packaged host is trusted.
  const packaged = page.protocol === 'game:' && page.host === 'local'
    && resolved.protocol === 'game:' && resolved.host === 'local';
  if (!web && !packaged) throw new Error('模型必须使用本项目同源资源，不允许外部下载地址。');
  return resolved.href;
}

/** Reject external dependencies and compressed formats before GLTFLoader can request anything. */
function validateEmbeddedGlb(data: ArrayBuffer): void {
  if (data.byteLength < 20) throw new Error('模型不是完整的 GLB 文件。');
  const view = new DataView(data), jsonLength = view.getUint32(12, true);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2
    || view.getUint32(8, true) !== data.byteLength || view.getUint32(16, true) !== 0x4e4f534a
    || jsonLength > data.byteLength - 20) throw new Error('模型 GLB 头或长度无效。');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, jsonLength))) as Record<string, unknown>;
  for (const name of ['buffers', 'images']) {
    const values = json[name];
    if (Array.isArray(values) && values.some(value => value && Object.hasOwn(value, 'uri'))) {
      throw new Error('当前仅支持资源全部内嵌的 GLB；请将缓冲区与图片打包进模型。');
    }
  }
  const compressed = new Set(['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu']);
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    for (const name of ['extensionsUsed', 'extensionsRequired']) {
      if (Array.isArray(object[name]) && (object[name] as unknown[]).some(item => typeof item === 'string' && compressed.has(item))) {
        throw new Error('当前未配置压缩模型解码器；请导出未压缩的内嵌 GLB。');
      }
    }
    if (object.extensions && typeof object.extensions === 'object' && Object.keys(object.extensions).some(name => compressed.has(name))) {
      throw new Error('当前未配置压缩模型解码器；请导出未压缩的内嵌 GLB。');
    }
    for (const nested of Object.values(object)) visit(nested);
  };
  visit(json);
}

async function download(url: string, signal: AbortSignal, progress: (value: ModelLoadProgress) => void): Promise<ArrayBuffer> {
  checkAbort(signal);
  progress({ phase: 'download', received: 0 });
  const response = await fetch(url, { signal, credentials: 'same-origin', redirect: 'error' });
  checkAbort(signal);
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new HttpError(response.status);
  }
  const length = response.headers.get('Content-Length'), encoding = response.headers.get('Content-Encoding');
  const parsed = length && /^\d+$/.test(length) ? Number(length) : undefined;
  let total = parsed !== undefined && Number.isSafeInteger(parsed) && (!encoding || encoding === 'identity') ? parsed : undefined;
  const emit = (received: number): void => {
    if (total !== undefined && received > total) total = undefined;
    progress({ phase: 'download', received, ...(total !== undefined ? { total } : {}) });
  };
  emit(0);
  if (!response.body) {
    const data = await response.arrayBuffer(); checkAbort(signal); emit(data.byteLength); return data;
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let received = 0;
  const abort = (): void => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      checkAbort(signal);
      const { done, value } = await reader.read();
      checkAbort(signal);
      if (done) break;
      chunks.push(value); received += value.byteLength; emit(received);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
  const data = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return data.buffer;
}

/** No external decoders: the release pipeline must provide an uncompressed, self-contained GLB. */
export const loadModel: ModelLoader = async (source, signal, progress) => {
  const url = localUrl(source.url);
  let data: ArrayBuffer | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { data = await download(url, signal, progress); break; }
    catch (error) {
      checkAbort(signal);
      const transient = error instanceof TypeError || error instanceof HttpError && (error.status === 408 || error.status === 429 || error.status >= 500);
      if (attempt || !transient) throw error;
    }
  }
  checkAbort(signal);
  validateEmbeddedGlb(data!);
  progress({ phase: 'decode', received: data!.byteLength, total: data!.byteLength });
  checkAbort(signal);
  const manager = new LoadingManager();
  let imageFailed = false;
  manager.onError = url => {
    imageFailed = true;
    // GLTFLoader revokes embedded-image blob URLs on success, but not on failure.
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  };
  const template = await new GLTFLoader(manager).parseAsync(data!, '');
  // GLTFLoader catches image errors and substitutes a null map. Do not publish an
  // apparently successful production model after one of its embedded images failed.
  if (signal.aborted || imageFailed) {
    disposeModelTemplate(template);
    if (signal.aborted) throw modelAbortError();
    throw new Error('模型内嵌图片解码失败，请检查资源后重试。');
  }
  return template;
};
