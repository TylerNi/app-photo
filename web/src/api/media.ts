import { apiGet, apiUpload } from './client';
import type { Media } from './types';

export function listAlbum(
  before?: string,
  limit?: number,
): Promise<{ items: Media[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (before) params.set('before', before);
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  return apiGet<{ items: Media[]; nextCursor: string | null }>(
    query ? `/api/album?${query}` : '/api/album',
  );
}

export async function uploadToAlbum(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<Media> {
  const form = new FormData();
  form.append('files', file);
  const result = await apiUpload<{ items: Media[] }>(
    '/api/album',
    form,
    onProgress ? (ratio) => onProgress(Math.round(ratio * 100)) : undefined,
  );
  return result.items[0];
}
