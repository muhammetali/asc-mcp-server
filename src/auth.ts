import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';

interface TokenCache {
  token: string;
  expiresAt: number;
}

let cachedToken: TokenCache | null = null;

export function getToken(): string {
  const now = Math.floor(Date.now() / 1000);

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.token;
  }

  const keyId = process.env.APP_STORE_CONNECT_KEY_ID;
  const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID;
  const p8Path = process.env.APP_STORE_CONNECT_P8_PATH;

  if (!keyId || !issuerId || !p8Path) {
    throw new Error(
      'Missing credentials. Set APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID, APP_STORE_CONNECT_P8_PATH in .env'
    );
  }

  const privateKey = readFileSync(p8Path, 'utf8');
  const expiresAt = now + 1200; // 20 minutes (Apple max)

  const token = jwt.sign(
    {
      iss: issuerId,
      iat: now,
      exp: expiresAt,
      aud: 'appstoreconnect-v1',
    },
    privateKey,
    {
      algorithm: 'ES256',
      header: {
        alg: 'ES256',
        kid: keyId,
        typ: 'JWT',
      },
    }
  );

  cachedToken = { token, expiresAt };
  return token;
}
