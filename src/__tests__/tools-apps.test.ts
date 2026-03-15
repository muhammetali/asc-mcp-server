import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth
vi.mock('../auth.js', () => ({
  getToken: vi.fn(() => 'mock-jwt-token'),
}));

describe('tools/apps', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('listApps', () => {
    it('should return markdown table with apps', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: [
            { id: 'app-1', attributes: { name: 'GoyGoyChat', bundleId: 'com.fixmob.goygoy', sku: 'GOYGOY', primaryLocale: 'en-US' } },
            { id: 'app-2', attributes: { name: 'TestApp', bundleId: 'com.test.app', sku: null, primaryLocale: 'tr' } },
          ],
        }), { status: 200 })
      );

      const { listApps } = await import('../tools/apps.js');
      const result = await listApps();

      expect(result).toContain('## App Store Connect - Apps');
      expect(result).toContain('GoyGoyChat');
      expect(result).toContain('com.fixmob.goygoy');
      expect(result).toContain('app-1');
      expect(result).toContain('TestApp');
      expect(result).toContain('**Total:** 2 app(s)');
    });

    it('should handle empty app list', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      );

      const { listApps } = await import('../tools/apps.js');
      const result = await listApps();

      expect(result).toContain('No apps found');
    });
  });

  describe('getAppInfo', () => {
    it('should include privacy policy warnings', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // App response
          return Promise.resolve(new Response(JSON.stringify({
            data: { id: 'app-1', attributes: { name: 'GoyGoyChat', bundleId: 'com.fixmob.goygoy', sku: 'GG', primaryLocale: 'en-US', isOrEverWasMadeForKids: false, contentRightsDeclaration: null } },
            included: [],
          }), { status: 200 }));
        }
        // AppInfos response with missing privacy policy
        return Promise.resolve(new Response(JSON.stringify({
          data: [{ id: 'info-1', attributes: { appStoreState: 'READY_FOR_SALE', appStoreAgeRating: 'SEVENTEEN_PLUS' } }],
          included: [
            { type: 'appInfoLocalizations', id: 'loc-1', attributes: { locale: 'en-US', name: 'GoyGoyChat', subtitle: 'Voice Chat', privacyPolicyUrl: 'https://example.com/privacy', privacyChoicesUrl: null } },
            { type: 'appInfoLocalizations', id: 'loc-2', attributes: { locale: 'tr', name: 'GoyGoyChat', subtitle: null, privacyPolicyUrl: null, privacyChoicesUrl: null } },
          ],
        }), { status: 200 }));
      });

      const { getAppInfo } = await import('../tools/apps.js');
      const result = await getAppInfo('app-1');

      expect(result).toContain('## App Info: GoyGoyChat');
      expect(result).toContain('com.fixmob.goygoy');
      // Should warn about missing privacy policy for 'tr'
      expect(result).toContain('CRITICAL');
      expect(result).toContain('Privacy Policy URL missing');
      expect(result).toContain('tr');
      // Should warn about missing locales (de-DE, es-MX, fr-FR, ru, ar-SA)
      expect(result).toContain('Missing localizations');
    });

    it('should show age rating', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({
            data: { id: 'app-1', attributes: { name: 'App', bundleId: 'com.test', sku: 'A', primaryLocale: 'en-US', isOrEverWasMadeForKids: false, contentRightsDeclaration: null } },
            included: [],
          }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({
          data: [{ id: 'info-1', attributes: { appStoreState: 'READY_FOR_SALE', appStoreAgeRating: 'SEVENTEEN_PLUS' } }],
          included: [],
        }), { status: 200 }));
      });

      const { getAppInfo } = await import('../tools/apps.js');
      const result = await getAppInfo('app-1');
      expect(result).toContain('SEVENTEEN_PLUS');
    });
  });
});
