export type Profile = string;

export interface Media {
  id: string;
  owner: Profile;
  kind: 'photo' | 'video';
  source: 'snap' | 'album';
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  takenAt: string | null;
  createdAt: string;
  localDay: string;
  thumbUrl: string;
  originalUrl: string;
}

export interface Streak {
  current: number;
  total: number;
  atRisk: boolean;
  deadline: string | null;
  todayComplete: boolean;
}

export interface TodayState {
  localDay: string;
  streak: Streak;
  me: { profile: Profile; sent: boolean; media: Media | null };
  other: {
    profile: Profile;
    sent: boolean;
    revealed: boolean;
    media: Media | null;
    teaserUrl: string | null;
  };
}
