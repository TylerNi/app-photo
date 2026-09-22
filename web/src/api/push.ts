import { apiGet, apiPost } from './client';

export function getPushKey(): Promise<{ key: string }> {
  return apiGet<{ key: string }>('/api/push/key');
}

export function subscribePush(subscription: PushSubscriptionJSON): Promise<void> {
  return apiPost<void>('/api/push/subscribe', subscription);
}

export function unsubscribePush(endpoint: string): Promise<void> {
  return apiPost<void>('/api/push/unsubscribe', { endpoint });
}
