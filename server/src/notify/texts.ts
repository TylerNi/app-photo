import { nextMidnightUtc } from '../day.js';
import type { NotificationPayload } from './push.js';
import { publicLink } from './push.js';

function hoursLeft(now: Date = new Date()): string {
  const remaining = new Date(nextMidnightUtc(now)).getTime() - now.getTime();
  const hours = Math.floor(remaining / 3600000);
  return hours <= 0 ? "moins d'une heure" : `${hours} h`;
}

export function snapSent(
  sender: string,
  recipientSent: boolean,
  streak: number,
  now: Date = new Date(),
): NotificationPayload {
  let body: string;
  if (streak === 0) {
    body = 'Envoie la tienne pour lancer le streak 🔥';
  } else if (recipientSent) {
    body = `Journée complète 🔥 ${streak} jours de streak`;
  } else {
    body = `À ton tour — il te reste ${hoursLeft(now)} pour garder les ${streak} jours 🔥`;
  }

  return {
    title: `📸 ${sender} t'a envoyé un Snap !`,
    body,
    tag: `snap-${sender}`,
    url: publicLink('/'),
  };
}

export function albumUpload(profile: string, photos: number, videos: number): NotificationPayload {
  const photoPart = `${photos} photo${photos > 1 ? 's' : ''}`;
  const videoPart = `${videos} vidéo${videos > 1 ? 's' : ''}`;

  let title: string;
  if (photos > 0 && videos > 0) {
    title = `🖼️ ${profile} vient d'ajouter ${photoPart} et ${videoPart} à votre album`;
  } else if (videos > 0) {
    title =
      videos === 1
        ? `🎬 ${profile} vient d'ajouter une vidéo à votre album`
        : `🎬 ${profile} vient d'ajouter ${videoPart} à votre album`;
  } else {
    title =
      photos === 1
        ? `🖼️ ${profile} vient d'ajouter une photo à votre album`
        : `🖼️ ${profile} vient d'ajouter ${photoPart} à votre album`;
  }

  return {
    title,
    body: 'Va voir ça 👀',
    tag: `album-${profile}`,
    url: publicLink('/album'),
  };
}

export function reminder1(
  streak: number,
  other: string,
  now: Date = new Date(),
): NotificationPayload {
  const title =
    streak === 0
      ? '📸 Envoie ta photo du jour !'
      : `🔥 ${streak} jours de streak... reste ${hoursLeft(now)} pour ne pas tout casser !`;
  const body =
    streak === 0 ? `${other} attend la tienne pour lancer le streak 🔥` : 'Envoie ta photo du jour 📸';

  return { title, body, tag: 'reminder', url: publicLink('/') };
}

export function reminder2(streak: number, now: Date = new Date()): NotificationPayload {
  return {
    title: `⏰ Dernier appel — ${streak} jours en jeu !`,
    body: `Il te reste ${hoursLeft(now)}. Une photo et c'est sauvé 🔥`,
    tag: 'reminder',
    url: publicLink('/'),
  };
}
