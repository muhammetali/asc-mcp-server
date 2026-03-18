import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(() => `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgfake_key_for_testing
hRANCAASfake_public_key_for_testing
-----END PRIVATE KEY-----`),
  existsSync: vi.fn(() => true),
  accessSync: vi.fn(() => undefined),
  constants: { R_OK: 4 },
}));

describe('auth', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset module cache to clear token cache between tests
    vi.resetModules();
    process.env = {
      ...originalEnv,
      APP_STORE_CONNECT_KEY_ID: 'TEST_KEY_ID',
      APP_STORE_CONNECT_ISSUER_ID: 'test-issuer-id',
      APP_STORE_CONNECT_P8_PATH: '/fake/path/key.p8',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should throw when credentials are missing', async () => {
    delete process.env.APP_STORE_CONNECT_KEY_ID;
    const { getToken } = await import('../auth.js');
    expect(() => getToken()).toThrow('Missing App Store Connect credentials');
  });

  it('should throw when KEY_ID is missing', async () => {
    process.env.APP_STORE_CONNECT_KEY_ID = '';
    const { getToken } = await import('../auth.js');
    expect(() => getToken()).toThrow('Missing App Store Connect credentials');
  });

  it('should throw when ISSUER_ID is missing', async () => {
    process.env.APP_STORE_CONNECT_ISSUER_ID = '';
    const { getToken } = await import('../auth.js');
    expect(() => getToken()).toThrow('Missing App Store Connect credentials');
  });

  it('should throw when P8_PATH is missing', async () => {
    process.env.APP_STORE_CONNECT_P8_PATH = '';
    const { getToken } = await import('../auth.js');
    expect(() => getToken()).toThrow('Missing App Store Connect credentials');
  });

  it('should generate JWT with correct structure', async () => {
    // Mock jwt.sign to capture arguments
    const signSpy = vi.spyOn(jwt, 'sign').mockReturnValue('mock.jwt.token' as any);

    const { getToken } = await import('../auth.js');
    const token = getToken();

    expect(token).toBe('mock.jwt.token');
    expect(signSpy).toHaveBeenCalledOnce();

    // Verify payload
    const [payload, , options] = signSpy.mock.calls[0];
    expect(payload).toMatchObject({
      iss: 'test-issuer-id',
      aud: 'appstoreconnect-v1',
    });
    expect((payload as any).iat).toBeTypeOf('number');
    expect((payload as any).exp).toBeTypeOf('number');
    expect((payload as any).exp - (payload as any).iat).toBe(1200); // 20 minutes

    // Verify options
    expect(options).toMatchObject({
      algorithm: 'ES256',
      header: {
        alg: 'ES256',
        kid: 'TEST_KEY_ID',
        typ: 'JWT',
      },
    });
  });

  it('should cache token and return same value on second call', async () => {
    const signSpy = vi.spyOn(jwt, 'sign').mockReturnValue('cached.jwt.token' as any);

    const { getToken } = await import('../auth.js');

    const token1 = getToken();
    const token2 = getToken();

    expect(token1).toBe('cached.jwt.token');
    expect(token2).toBe('cached.jwt.token');
    expect(signSpy).toHaveBeenCalledOnce(); // Only called once due to caching
  });

  it('should regenerate token when cache expires', async () => {
    const signSpy = vi.spyOn(jwt, 'sign')
      .mockReturnValueOnce('first.token' as any)
      .mockReturnValueOnce('second.token' as any);

    const { getToken } = await import('../auth.js');

    const token1 = getToken();
    expect(token1).toBe('first.token');

    // Simulate time passing beyond token expiry (advance 1200+ seconds)
    const realDateNow = Date.now;
    vi.spyOn(Date, 'now').mockReturnValue(realDateNow() + 1200_000);

    const token2 = getToken();
    expect(token2).toBe('second.token');
    expect(signSpy).toHaveBeenCalledTimes(2);

    vi.spyOn(Date, 'now').mockRestore();
  });
});
