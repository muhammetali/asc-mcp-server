import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth module
vi.mock('../auth.js', () => ({
  getToken: vi.fn(() => 'mock-jwt-token'),
}));

describe('client', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('ASCClientError', () => {
    it('should format error message correctly', async () => {
      const { ASCClientError } = await import('../client.js');
      const error = new ASCClientError(403, [{
        id: '1',
        status: '403',
        code: 'FORBIDDEN',
        title: 'Forbidden',
        detail: 'You do not have access',
      }]);

      expect(error.status).toBe(403);
      expect(error.name).toBe('ASCClientError');
      expect(error.message).toContain('FORBIDDEN');
      expect(error.message).toContain('You do not have access');
      expect(error.errors).toHaveLength(1);
    });

    it('should join multiple errors', async () => {
      const { ASCClientError } = await import('../client.js');
      const error = new ASCClientError(400, [
        { id: '1', status: '400', code: 'ERR1', title: 'First', detail: 'detail1' },
        { id: '2', status: '400', code: 'ERR2', title: 'Second', detail: 'detail2' },
      ]);

      expect(error.message).toContain('ERR1');
      expect(error.message).toContain('ERR2');
    });
  });

  describe('ascGet', () => {
    it('should send GET request with auth header', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: '1' }] }), { status: 200 })
      );
      global.fetch = mockFetch;

      const { ascGet } = await import('../client.js');
      const result = await ascGet('/v1/apps');

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('https://api.appstoreconnect.apple.com/v1/apps');
      expect(options.headers.Authorization).toBe('Bearer mock-jwt-token');
    });

    it('should append query params', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      );
      global.fetch = mockFetch;

      const { ascGet } = await import('../client.js');
      await ascGet('/v1/apps', { 'fields[apps]': 'name,bundleId', 'limit': '10' });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('fields%5Bapps%5D=name%2CbundleId');
      expect(url).toContain('limit=10');
    });

    it('should throw ASCClientError on 4xx response', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          errors: [{
            id: '1', status: '404', code: 'NOT_FOUND',
            title: 'Not Found', detail: 'App not found',
          }],
        }), { status: 404 })
      );

      const { ascGet, ASCClientError } = await import('../client.js');
      await expect(ascGet('/v1/apps/fake-id')).rejects.toThrow(ASCClientError);
    });

    it('should handle rate limiting (429)', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errors: [] }), {
          status: 429,
          headers: { 'retry-after': '60' },
        })
      );

      const { ascGet, ASCClientError } = await import('../client.js');
      try {
        await ascGet('/v1/apps');
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ASCClientError);
        const err = e as InstanceType<typeof ASCClientError>;
        expect(err.status).toBe(429);
        expect(err.errors[0].code).toBe('RATE_LIMIT');
        expect(err.errors[0].detail).toContain('60');
      }
    });

    it('should include AbortSignal for timeout', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      );
      global.fetch = mockFetch;

      const { ascGet } = await import('../client.js');
      await ascGet('/v1/apps');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('ascPost', () => {
    it('should send POST with JSON body', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { id: 'new-id' } }), { status: 201 })
      );
      global.fetch = mockFetch;

      const { ascPost } = await import('../client.js');
      const body = { data: { type: 'appStoreVersions', attributes: { versionString: '2.0.0' } } };
      await ascPost('/v1/appStoreVersions', body);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('POST');
      expect(options.body).toBe(JSON.stringify(body));
      expect(options.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('ascPatch', () => {
    it('should send PATCH request', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { id: '1' } }), { status: 200 })
      );
      global.fetch = mockFetch;

      const { ascPatch } = await import('../client.js');
      await ascPatch('/v1/appStoreVersionLocalizations/123', { data: { attributes: { whatsNew: 'test' } } });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('PATCH');
    });
  });

  describe('ascDelete', () => {
    it('should send DELETE and handle 204', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 })
      );
      global.fetch = mockFetch;

      const { ascDelete } = await import('../client.js');
      await ascDelete('/v1/appScreenshots/123');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/v1/appScreenshots/123');
      expect(options.method).toBe('DELETE');
    });
  });

  describe('ascGetAll (pagination)', () => {
    it('should follow next links', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({
            data: [{ id: '1' }, { id: '2' }],
            links: { self: 'page1', next: 'https://api.appstoreconnect.apple.com/v1/apps?page=2' },
          }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({
          data: [{ id: '3' }],
          links: { self: 'page2' },
        }), { status: 200 }));
      });

      const { ascGetAll } = await import('../client.js');
      const result = await ascGetAll('/v1/apps');

      expect(result).toHaveLength(3);
      expect(result.map((r: any) => r.id)).toEqual(['1', '2', '3']);
    });

    it('should stop at MAX_PAGES to prevent infinite loops', async () => {
      // Return next link on every page
      global.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({
          data: [{ id: 'item' }],
          links: { self: 'page', next: 'https://api.appstoreconnect.apple.com/v1/apps?page=999' },
        }), { status: 200 }))
      );

      const { ascGetAll } = await import('../client.js');
      const result = await ascGetAll('/v1/apps');

      // MAX_PAGES is 20, so should stop after 20 pages
      expect(result.length).toBeLessThanOrEqual(20);
      expect(global.fetch).toHaveBeenCalledTimes(20);
    });
  });

  describe('handleResponse edge cases', () => {
    it('should handle non-JSON error response', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response('Internal Server Error', { status: 500 })
      );

      const { ascGet, ASCClientError } = await import('../client.js');
      try {
        await ascGet('/v1/apps');
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ASCClientError);
        const err = e as InstanceType<typeof ASCClientError>;
        expect(err.errors[0].code).toBe('UNKNOWN');
        expect(err.errors[0].detail).toContain('Internal Server Error');
      }
    });

    it('should handle non-JSON success response', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response('plain text response', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
      );

      const { ascGet } = await import('../client.js');
      const result = await ascGet('/v1/something');
      expect(result).toBe('plain text response');
    });
  });
});
