import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../auth.js', () => ({
  getToken: vi.fn(() => 'mock-jwt-token'),
}));

describe('error handling (index.ts helpers)', () => {
  // We test the error formatting logic used in index.ts by importing ASCClientError
  // and verifying the error format matches what tools return

  describe('ASCClientError formatting', () => {
    it('should include all error details', async () => {
      const { ASCClientError } = await import('../client.js');
      const error = new ASCClientError(403, [
        { id: '1', status: '403', code: 'FORBIDDEN', title: 'Access Denied', detail: 'Your API key lacks permissions' },
      ]);

      expect(error.message).toContain('FORBIDDEN');
      expect(error.message).toContain('Access Denied');
      expect(error.message).toContain('Your API key lacks permissions');
      expect(error.status).toBe(403);
    });

    it('should handle multiple errors', async () => {
      const { ASCClientError } = await import('../client.js');
      const error = new ASCClientError(400, [
        { id: '1', status: '400', code: 'INVALID_FIELD', title: 'Invalid Field', detail: 'versionString is required' },
        { id: '2', status: '400', code: 'MISSING_RELATIONSHIP', title: 'Missing', detail: 'app relationship is required' },
      ]);

      expect(error.message).toContain('INVALID_FIELD');
      expect(error.message).toContain('MISSING_RELATIONSHIP');
    });
  });

  describe('timeout behavior', () => {
    it('should abort request after timeout', async () => {
      // Simulate a slow server
      global.fetch = vi.fn().mockImplementation((_url: string, options?: any) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }));
          }, 60_000); // 60 seconds - longer than default timeout

          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
        });
      });

      const { ascGet } = await import('../client.js');

      // DEFAULT_TIMEOUT_MS is 30_000, so this should abort
      await expect(ascGet('/v1/slow-endpoint')).rejects.toThrow('aborted');
    }, 35_000);
  });

  describe('rate limit error details', () => {
    it('should include retry-after from headers', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errors: [] }), {
          status: 429,
          headers: { 'retry-after': '45' },
        })
      );

      const { ascGet, ASCClientError } = await import('../client.js');

      try {
        await ascGet('/v1/apps');
        expect.unreachable();
      } catch (e) {
        const err = e as InstanceType<typeof ASCClientError>;
        expect(err.errors[0].detail).toContain('45');
      }
    });

    it('should default to 30 seconds when retry-after missing', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errors: [] }), { status: 429 })
      );

      const { ascGet, ASCClientError } = await import('../client.js');

      try {
        await ascGet('/v1/apps');
        expect.unreachable();
      } catch (e) {
        const err = e as InstanceType<typeof ASCClientError>;
        expect(err.errors[0].detail).toContain('30');
      }
    });
  });
});
