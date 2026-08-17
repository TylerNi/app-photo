import { apiDelete, apiPost } from './client';

export function deleteTodaySnaps(): Promise<void> {
  return apiDelete<void>('/api/snap/today');
}

export function resetStreak(): Promise<void> {
  return apiPost<void>('/api/streak/reset');
}

export function deleteAllMedia(): Promise<void> {
  return apiDelete<void>('/api/media');
}
