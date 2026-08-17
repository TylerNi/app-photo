import webpush from 'web-push';
import { config } from '../config.js';
import { db } from '../db.js';

export interface NotificationPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
}

webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);

interface SubscriptionRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const subscriptionsStmt = db.prepare(
  'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE profile = ?',
);

const deleteStmt = db.prepare('DELETE FROM push_subscriptions WHERE id = ?');

const failStmt = db.prepare(
  'UPDATE push_subscriptions SET fail_count = fail_count + 1 WHERE id = ?',
);

const okStmt = db.prepare('UPDATE push_subscriptions SET last_ok_at = ? WHERE id = ?');

export function publicLink(path: string): string {
  return `${config.publicUrl.replace(/\/+$/, '')}${path}`;
}

export async function sendTo(profile: string, payload: NotificationPayload): Promise<void> {
  const rows = subscriptionsStmt.all(profile) as SubscriptionRow[];
  const body = JSON.stringify(payload);

  for (const row of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        body,
      );
      okStmt.run(new Date().toISOString(), row.id);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        deleteStmt.run(row.id);
        continue;
      }
      failStmt.run(row.id);
      process.stderr.write(`Notification non envoyée à ${profile} : ${String(err)}\n`);
    }
  }
}
