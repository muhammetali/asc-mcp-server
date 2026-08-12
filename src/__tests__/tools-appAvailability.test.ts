import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../auth.js', () => ({
  getToken: vi.fn(() => 'mock-jwt-token'),
}));

describe('tools/appAvailability', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('getAppPricing', () => {
    it('should NOT send fields[appPricePoints] (regression: 400 "not a valid type name", found live 2026-08-12)', async () => {
      let capturedUrl = '';
      global.fetch = vi.fn().mockImplementation((url: string) => {
        capturedUrl = url;
        if (url.includes('appPriceSchedule')) {
          return Promise.resolve(new Response(JSON.stringify({
            data: { id: 'sched-1', type: 'appPriceSchedules' },
            included: [
              { id: 'price-1', type: 'appPrices', attributes: { startDate: '2026-01-01', endDate: null } },
            ],
          }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }));
      });

      const { getAppPricing } = await import('../tools/appAvailability.js');
      const result = await getAppPricing('app-1');

      // The exact bug: this query param doesn't exist for this endpoint per
      // Apple's OpenAPI spec (fields[] enum is appPriceSchedules/apps/
      // territories/appPrices only) — price-point values live under the
      // separate /v3/appPricePoints/{id} resource now.
      expect(capturedUrl).not.toContain('fields%5BappPricePoints%5D');
      expect(capturedUrl).not.toContain('fields[appPricePoints]');
      expect(result).toContain('App Pricing');
      expect(result).toContain('2026-01-01');
    });

    it('should still request fields[appPrices] (startDate/endDate) — that one IS valid', async () => {
      let capturedUrl = '';
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('appPriceSchedule')) {
          capturedUrl = url;
          return Promise.resolve(new Response(JSON.stringify({ data: { id: 'sched-1' }, included: [] }), { status: 200 }));
        }
        // Territory lookup fails harmlessly here — this test only cares
        // about the appPriceSchedule request's query params.
        return Promise.resolve(new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 }));
      });

      const { getAppPricing } = await import('../tools/appAvailability.js');
      await getAppPricing('app-1');

      expect(decodeURIComponent(capturedUrl)).toContain('fields[appPrices]=startDate,endDate');
    });

    it('should list available territories via appAvailabilityV2 -> territoryAvailabilities (regression: old flat /availableTerritories path does not exist, was silently swallowed)', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('appPriceSchedule')) {
          return Promise.resolve(new Response(JSON.stringify({ data: { id: 'sched-1' }, included: [] }), { status: 200 }));
        }
        if (url.includes('appAvailabilityV2')) {
          return Promise.resolve(new Response(JSON.stringify({
            data: { id: 'avail-1', type: 'appAvailabilities' },
          }), { status: 200 }));
        }
        if (url.includes('territoryAvailabilities')) {
          return Promise.resolve(new Response(JSON.stringify({
            data: [
              { id: 'ta-0', attributes: { available: true }, relationships: { territory: { data: { id: 'USA' } } } },
              { id: 'ta-1', attributes: { available: true }, relationships: { territory: { data: { id: 'TUR' } } } },
              { id: 'ta-2', attributes: { available: false }, relationships: { territory: { data: { id: 'DEU' } } } },
            ],
          }), { status: 200 }));
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      });

      const { getAppPricing } = await import('../tools/appAvailability.js');
      const result = await getAppPricing('app-1');

      // Only the 2 AVAILABLE territories are listed — DEU is unavailable, excluded
      expect(result).toContain('Available Territories (2)');
      expect(result).toContain('USA');
      expect(result).toContain('TUR');
      expect(result).not.toContain('DEU');
    });

    it('should fall back to "Could not fetch territory data" if the availability lookup itself fails', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('appPriceSchedule')) {
          return Promise.resolve(new Response(JSON.stringify({ data: { id: 'sched-1' }, included: [] }), { status: 200 }));
        }
        if (url.includes('appAvailabilityV2')) {
          return Promise.resolve(new Response(JSON.stringify({
            error: { code: 404, title: 'Not Found', detail: 'no availability' },
          }), { status: 404 }));
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      });

      const { getAppPricing } = await import('../tools/appAvailability.js');
      const result = await getAppPricing('app-1');

      expect(result).toContain('Could not fetch territory data');
    });
  });
});
