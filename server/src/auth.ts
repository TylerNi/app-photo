import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';

declare global {
  namespace Express {
    interface Request {
      profile?: string;
    }
  }
}

const COOKIE_NAME = 'session';
const MAX_AGE = 10 * 365 * 24 * 60 * 60 * 1000;

export function setSession(res: Response, profile: string | null): void {
  const payload: { a: number; p?: string } = { a: 1 };
  if (profile) payload.p = profile;
  res.cookie(COOKIE_NAME, JSON.stringify(payload), {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
    secure: false,
  });
}

export function readSession(req: Request): { authenticated: boolean; profile: string | null } {
  const raw = req.signedCookies?.[COOKIE_NAME];
  if (typeof raw !== 'string') return { authenticated: false, profile: null };
  try {
    const payload = JSON.parse(raw) as { a?: number; p?: string };
    if (payload.a !== 1) return { authenticated: false, profile: null };
    return { authenticated: true, profile: payload.p ?? null };
  } catch {
    return { authenticated: false, profile: null };
  }
}

export function checkPassword(password: unknown): boolean {
  if (typeof password !== 'string') return false;
  const given = Buffer.from(password);
  const expected = Buffer.from(config.appPassword);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!readSession(req).authenticated) {
    res.status(401).json({ error: 'unauthorized', message: 'Mot de passe requis.' });
    return;
  }
  next();
}

export function requireProfile(req: Request, res: Response, next: NextFunction): void {
  const { profile } = readSession(req);
  if (!profile) {
    res.status(400).json({ error: 'bad_request', message: 'Aucun profil sélectionné.' });
    return;
  }
  req.profile = profile;
  next();
}
