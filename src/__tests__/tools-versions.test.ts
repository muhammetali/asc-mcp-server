import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../auth.js', () => ({
  getToken: vi.fn(() => 'mock-jwt-token'),
}));

describe('tools/versions', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('listVersions', () => {
    it('should display version states with indicators', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: [
            { id: 'v1', attributes: { versionString: '2.0.0', appStoreState: 'READY_FOR_SALE', platform: 'IOS', releaseType: 'MANUAL', createdDate: '2026-03-01T00:00:00Z' } },
            { id: 'v2', attributes: { versionString: '2.1.0', appStoreState: 'REJECTED', platform: 'IOS', releaseType: 'MANUAL', createdDate: '2026-03-10T00:00:00Z' } },
            { id: 'v3', attributes: { versionString: '2.1.1', appStoreState: 'IN_REVIEW', platform: 'IOS', releaseType: 'MANUAL', createdDate: '2026-03-12T00:00:00Z' } },
          ],
        }), { status: 200 })
      );

      const { listVersions } = await import('../tools/versions.js');
      const result = await listVersions('app-1');

      expect(result).toContain('## App Store Versions');
      expect(result).toContain('[LIVE]');
      expect(result).toContain('[REJECTED]');
      expect(result).toContain('[REVIEW]');
      expect(result).toContain('2.0.0');
      expect(result).toContain('2.1.0');
      expect(result).toContain('ATTENTION');
      expect(result).toContain('In Review');
      // Version IDs must be included for downstream tool usage
      expect(result).toContain('`v1`');
      expect(result).toContain('`v2`');
      expect(result).toContain('`v3`');
      expect(result).toContain('Version ID');
    });

    it('should handle empty versions', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      );

      const { listVersions } = await import('../tools/versions.js');
      const result = await listVersions('app-1');
      expect(result).toContain('No versions found');
    });

    it('should apply platform filter', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      );

      const { listVersions } = await import('../tools/versions.js');
      await listVersions('app-1', 'IOS');

      const [url] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('filter%5Bplatform%5D=IOS');
    });
  });

  describe('createVersion', () => {
    it('should return next steps after creation', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: {
            id: 'new-version-id',
            attributes: {
              versionString: '2.2.0',
              platform: 'IOS',
              appStoreState: 'PREPARE_FOR_SUBMISSION',
              releaseType: 'MANUAL',
            },
          },
        }), { status: 201 })
      );

      const { createVersion } = await import('../tools/versions.js');
      const result = await createVersion('app-1', '2.2.0', 'IOS', 'MANUAL');

      expect(result).toContain('## Version Created');
      expect(result).toContain('2.2.0');
      expect(result).toContain('new-version-id');
      expect(result).toContain('asc_update_whats_new');
      expect(result).toContain('asc_list_builds');
      expect(result).toContain('asc_assign_build');
      expect(result).toContain('asc_submit_for_review');
    });
  });

  describe('updateWhatsNew', () => {
    it('should update existing and create new localizations', async () => {
      const fetchCalls: string[] = [];
      global.fetch = vi.fn().mockImplementation((url: string, options?: any) => {
        fetchCalls.push(`${options?.method || 'GET'} ${url}`);

        // First call: GET localizations
        if (!options?.method || options.method === 'GET') {
          return Promise.resolve(new Response(JSON.stringify({
            data: [
              { id: 'loc-en', attributes: { locale: 'en-US', whatsNew: 'Old text' } },
            ],
          }), { status: 200 }));
        }
        // PATCH/POST calls
        return Promise.resolve(new Response(JSON.stringify({ data: { id: 'updated' } }), { status: 200 }));
      });

      const { updateWhatsNew } = await import('../tools/versions.js');
      const result = await updateWhatsNew('v1', {
        'en-US': 'Bug fixes and improvements',
        'tr': 'Hata duzeltmeleri',
      });

      expect(result).toContain("## What's New Updated");
      expect(result).toContain('en-US');
      expect(result).toContain('Updated');
      expect(result).toContain('tr');
      expect(result).toContain('Created');
      // Should warn about missing locales (de-DE, es-MX, fr-FR, ru, ar-SA)
      expect(result).toContain('Warning');
      expect(result).toContain('de-DE');
    });
  });

  describe('getVersionLocalizations', () => {
    it('should warn about empty fields', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: [
            { id: 'loc-1', attributes: { locale: 'en-US', whatsNew: 'Fixes', description: 'Great app with 200 chars...', keywords: 'chat,voice', promotionalText: null, marketingUrl: null, supportUrl: null } },
            { id: 'loc-2', attributes: { locale: 'tr', whatsNew: null, description: null, keywords: null, promotionalText: null, marketingUrl: null, supportUrl: null } },
          ],
        }), { status: 200 })
      );

      const { getVersionLocalizations } = await import('../tools/versions.js');
      const result = await getVersionLocalizations('v1');

      expect(result).toContain('en-US');
      expect(result).toContain('tr');
      expect(result).toContain('**EMPTY**'); // tr has empty What's New
      expect(result).toContain("Warning");
      expect(result).toContain("Empty What's New");
      // Missing locales warning
      expect(result).toContain('de-DE');
    });
  });

  describe('assignBuildToVersion', () => {
    it('should assign build to version successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: { type: 'appStoreVersions', id: 'v1' },
        }), { status: 200 })
      );

      const { assignBuildToVersion } = await import('../tools/versions.js');
      const result = await assignBuildToVersion('v1', 'build-42');

      expect(result).toContain('Build Assigned');
      expect(result).toContain('build-42');
      expect(result).toContain('v1');
      expect(result).toContain('asc_submit_for_review');
    });

    it('should reject empty versionId', async () => {
      const { assignBuildToVersion } = await import('../tools/versions.js');
      await expect(assignBuildToVersion('', 'build-42')).rejects.toThrow('Invalid versionId');
    });

    it('should reject empty buildId', async () => {
      const { assignBuildToVersion } = await import('../tools/versions.js');
      await expect(assignBuildToVersion('v1', '')).rejects.toThrow('Invalid buildId');
    });
  });

  describe('updateVersionLocalization', () => {
    it('should update promotional text for an existing locale', async () => {
      const mockFetch = vi.fn()
        // GET existing localizations
        .mockResolvedValueOnce(new Response(JSON.stringify({
          data: [
            { id: 'loc-en', attributes: { locale: 'en-US', whatsNew: 'Fixes', description: 'Great app', keywords: 'chat', promotionalText: 'Old promo', marketingUrl: null, supportUrl: null } },
          ],
        }), { status: 200 }))
        // PATCH localization
        .mockResolvedValueOnce(new Response(JSON.stringify({
          data: { id: 'loc-en', type: 'appStoreVersionLocalizations' },
        }), { status: 200 }));

      global.fetch = mockFetch;

      const { updateVersionLocalization } = await import('../tools/versions.js');
      const result = await updateVersionLocalization('v1', 'en-US', {
        promotionalText: 'New promotional text for the app',
      });

      expect(result).toContain('Version Localization Updated: en-US');
      expect(result).toContain('promotionalText');
      expect(result).toContain('New promotional text');
      expect(result).toContain('Updated');
    });
  });
});
