import jwt from 'jsonwebtoken';
import { readFileSync, existsSync, accessSync, constants as fsConstants } from 'fs';

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
      'Missing App Store Connect credentials. Ensure all required environment variables are set in .env file.'
    );
  }

  // Validate P8 file exists and is readable before attempting to read
  if (!existsSync(p8Path)) {
    throw new Error('App Store Connect private key file not found. Check the configured path.');
  }
  try {
    accessSync(p8Path, fsConstants.R_OK);
  } catch {
    throw new Error('App Store Connect private key file is not readable. Check file permissions.');
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
