import type { Media } from '../types.js';

export async function onAlbumUpload(profile: string, items: Media[]): Promise<void> {}

export async function onSnapSent(sender: string, media: Media): Promise<void> {}
