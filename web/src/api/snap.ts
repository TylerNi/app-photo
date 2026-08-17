import { apiGet, apiUpload } from './client';
import type { TodayState } from './types';

export function getToday(): Promise<TodayState> {
  return apiGet<TodayState>('/api/snap/today');
}

export function sendSnap(file: File, onProgress?: (pct: number) => void): Promise<TodayState> {
  const form = new FormData();
  form.append('file', file);
  return apiUpload<TodayState>(
    '/api/snap',
    form,
    onProgress ? (ratio) => onProgress(Math.round(ratio * 100)) : undefined,
  );
}
