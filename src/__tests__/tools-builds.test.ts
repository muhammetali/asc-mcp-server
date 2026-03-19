import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../auth.js', () => ({
  getToken: vi.fn(() => 'mock-jwt-token'),
}));

describe('tools/builds', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('listBuilds', () => {
    it('should display builds with processing states', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: [
            {
              id: 'build-1', attributes: { version: '42', processingState: 'VALID', uploadedDate: '2026-03-10T12:00:00Z', expired: false },
              relationships: {
                preReleaseVersion: { data: { id: 'prv-1' } },
                buildBetaDetail: { data: { id: 'bd-1' } },
              },
            },
            {
              id: 'build-2', attributes: { version: '43', processingState: 'PROCESSING', uploadedDate: '2026-03-12T12:00:00Z', expired: false },
              relationships: {
                preReleaseVersion: { data: { id: 'prv-2' } },
                buildBetaDetail: { data: { id: 'bd-2' } },
              },
            },
          ],
          included: [
            { type: 'preReleaseVersions', id: 'prv-1', attributes: { version: '2.0.0', platform: 'IOS' } },
            { type: 'preReleaseVersions', id: 'prv-2', attributes: { version: '2.1.0', platform: 'IOS' } },
            { type: 'buildBetaDetails', id: 'bd-1', attributes: { internalBuildState: 'IN_BETA_TESTING', externalBuildState: 'IN_BETA_TESTING' } },
            { type: 'buildBetaDetails', id: 'bd-2', attributes: { internalBuildState: 'PROCESSING', externalBuildState: 'PROCESSING' } },
          ],
        }), { status: 200 })
      );

      const { listBuilds } = await import('../tools/builds.js');
      const result = await listBuilds('app-1', 10);

      expect(result).toContain('## Builds');
      expect(result).toContain('42');
      expect(result).toContain('43');
      expect(result).toContain('[OK]');
      expect(result).toContain('[...]');
      expect(result).toContain('2.0.0');
      expect(result).toContain('IN_BETA_TESTING');
      expect(result).toContain('1 valid');
      expect(result).toContain('1 processing');
      expect(result).toContain('Processing');
    });

    it('should handle empty builds', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      );

      const { listBuilds } = await import('../tools/builds.js');
      const result = await listBuilds('app-1');
      expect(result).toContain('No builds found');
    });
  });

  describe('listBetaGroups', () => {
    it('should show internal and external groups', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: [
            { id: 'bg-1', attributes: { name: 'Internal Testers', isInternalGroup: true, publicLinkEnabled: false, feedbackEnabled: true, hasAccessToAllBuilds: true } },
            { id: 'bg-2', attributes: { name: 'Beta Users', isInternalGroup: false, publicLinkEnabled: true, feedbackEnabled: false, hasAccessToAllBuilds: false } },
          ],
        }), { status: 200 })
      );

      const { listBetaGroups } = await import('../tools/builds.js');
      const result = await listBetaGroups('app-1');

      expect(result).toContain('Internal Testers');
      expect(result).toContain('Internal');
      expect(result).toContain('Beta Users');
      expect(result).toContain('External');
      expect(result).toContain('Enabled');
      expect(result).toContain('bg-1');
    });
  });

  describe('setEncryption', () => {
    it('should indicate no export compliance when set to false', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: { id: 'build-1', type: 'builds', attributes: { usesNonExemptEncryption: false } },
        }), { status: 200 })
      );

      const { setEncryption } = await import('../tools/builds.js');
      const result = await setEncryption('build-1', false);

      expect(result).toContain('Encryption Declaration Updated');
      expect(result).toContain('build-1');
      expect(result).toContain('false');
      expect(result).toContain('No export compliance');
    });

    it('should not mention export compliance when set to true', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: { id: 'build-2', type: 'builds', attributes: { usesNonExemptEncryption: true } },
        }), { status: 200 })
      );

      const { setEncryption } = await import('../tools/builds.js');
      const result = await setEncryption('build-2', true);

      expect(result).toContain('Encryption Declaration Updated');
      expect(result).toContain('true');
      expect(result).not.toContain('No export compliance');
    });

    it('should reject empty buildId', async () => {
      const { setEncryption } = await import('../tools/builds.js');
      await expect(setEncryption('', false)).rejects.toThrow('Invalid buildId');
    });
  });

  describe('getBuildDetails', () => {
    it('should return build info with version number and processing state', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: {
            id: 'build-42',
            attributes: {
              version: '55',
              processingState: 'VALID',
              uploadedDate: '2026-03-15T10:00:00Z',
              expirationDate: '2026-06-15T10:00:00Z',
              expired: false,
              minOsVersion: '16.0',
              usesNonExemptEncryption: false,
            },
          },
          included: [
            { type: 'betaBuildLocalizations', id: 'bbl-1', attributes: { locale: 'en-US', whatsNew: 'Bug fixes' } },
          ],
        }), { status: 200 })
      );

      const { getBuildDetails } = await import('../tools/builds.js');
      const result = await getBuildDetails('build-42');

      expect(result).toContain('Build Details: 55');
      expect(result).toContain('55');
      expect(result).toContain('[OK]');
      expect(result).toContain('VALID');
      expect(result).toContain('16.0');
      expect(result).toContain('No');
      expect(result).toContain('build-42');
      expect(result).toContain("TestFlight What's New");
      expect(result).toContain('en-US');
      expect(result).toContain('Bug fixes');
    });
  });
});
