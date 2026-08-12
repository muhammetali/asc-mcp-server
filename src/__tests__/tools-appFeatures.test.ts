import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../auth.js', () => ({
  getToken: vi.fn(() => 'mock-jwt-token'),
}));

describe('tools/appFeatures', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('clearSandboxTesterHistory', () => {
    it('should POST to the v2 singular endpoint with a plural sandboxTesters relationship (regression: old code used v1 plural path + type, found live 2026-08-12)', async () => {
      let capturedUrl = '';
      let capturedBody: any;
      global.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
        capturedUrl = url;
        capturedBody = JSON.parse(opts.body);
        return Promise.resolve(new Response(null, { status: 204 }));
      });

      const { clearSandboxTesterHistory } = await import('../tools/appFeatures.js');
      const result = await clearSandboxTesterHistory('tester-123');

      // Path: v2, SINGULAR "Request" (not "Requests")
      expect(capturedUrl).toContain('/v2/sandboxTestersClearPurchaseHistoryRequest');
      expect(capturedUrl).not.toContain('/v1/sandboxTestersClearPurchaseHistoryRequests');

      // Body: singular type, but relationship is a PLURAL array (Apple's
      // real schema — SandboxTestersClearPurchaseHistoryRequestV2CreateRequest)
      expect(capturedBody.data.type).toBe('sandboxTestersClearPurchaseHistoryRequest');
      expect(capturedBody.data.relationships.sandboxTesters.data).toEqual([
        { type: 'sandboxTesters', id: 'tester-123' },
      ]);

      expect(result).toContain('Purchase history cleared');
      expect(result).toContain('tester-123');
    });

    it('should reject an empty testerId before making any request', async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      const { clearSandboxTesterHistory } = await import('../tools/appFeatures.js');
      await expect(clearSandboxTesterHistory('')).rejects.toThrow();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
