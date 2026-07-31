import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface TokenPayload {
  uid: string;
  role: 'passenger' | 'rider';
  phone: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: `${config.jwtExpiresDays}d`,
    issuer: 'motoconnect',
  });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret, { issuer: 'motoconnect' });
    if (typeof decoded === 'string') return null;
    return decoded as unknown as TokenPayload;
  } catch {
    return null;
  }
}
