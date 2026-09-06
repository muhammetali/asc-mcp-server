import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../auth.js', () => ({
  getToken: vi.fn(() => 'mock-jwt-token'),
}));

describe('tools/screenshots', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('uploadScreenshot', () => {
    it('should reject non-image files', async () => {
      // Create a temp non-image file to test type validation
      const { writeFileSync, unlinkSync } = await import('fs');
      const tmpPath = '/tmp/asc_test_malicious.sh';
      writeFileSync(tmpPath, '#!/bin/bash\necho "bad"');
      try {
        const { uploadScreenshot } = await import('../tools/screenshots.js');
        await expect(uploadScreenshot('set-1', tmpPath, 'hack.sh'))
          .rejects.toThrow('Invalid file type');
      } finally {
        unlinkSync(tmpPath);
      }
    });

    it('should reject non-existent files', async () => {
      const { uploadScreenshot } = await import('../tools/screenshots.js');
      await expect(uploadScreenshot('set-1', '/tmp/nonexistent_screenshot.png', 'test.png'))
        .rejects.toThrow('File not found');
    });
  });

  describe('deleteAllScreenshotsInSet', () => {
    it('should delete all screenshots and report count', async () => {
      let deleteCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string, options?: any) => {
        if (options?.method === 'DELETE') {
          deleteCount++;
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        // GET screenshots
        return Promise.resolve(new Response(JSON.stringify({
          data: [
            { id: 'ss-1', attributes: { fileName: 'screen1.png' } },
            { id: 'ss-2', attributes: { fileName: 'screen2.png' } },
            { id: 'ss-3', attributes: { fileName: 'screen3.png' } },
          ],
        }), { status: 200 }));
      });

      const { deleteAllScreenshotsInSet } = await import('../tools/screenshots.js');
      const result = await deleteAllScreenshotsInSet('set-1');

      expect(deleteCount).toBe(3);
      expect(result).toContain('screen1.png');
      expect(result).toContain('screen2.png');
      expect(result).toContain('screen3.png');
      expect(result).toContain('3 screenshot(s) deleted');
    });

    it('should handle empty set gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      );

      const { deleteAllScreenshotsInSet } = await import('../tools/screenshots.js');
      const result = await deleteAllScreenshotsInSet('set-1');
      expect(result).toContain('No screenshots to delete');
    });
  });

  describe('listScreenshotSets', () => {
    it('should display sets with screenshots', async () => {
      // The function now fetches each set's screenshots separately via
      // /v1/appScreenshotSets/{id}/appScreenshots instead of using include.
      const mockFetch = vi.fn()
        // First call: list screenshot sets
        .mockResolvedValueOnce(new Response(JSON.stringify({
          data: [
            { id: 'set-1', attributes: { screenshotDisplayType: 'APP_IPHONE_67' } },
            { id: 'set-2', attributes: { screenshotDisplayType: 'APP_IPAD_PRO_129' } },
          ],
        }), { status: 200 }))
        // Second call: screenshots for set-1
        .mockResolvedValueOnce(new Response(JSON.stringify({
          data: [
            { type: 'appScreenshots', id: 'ss-1', attributes: { fileName: 'home.png', fileSize: 512000, assetDeliveryState: { state: 'COMPLETE' } } },
          ],
        }), { status: 200 }))
        // Third call: screenshots for set-2 (empty)
        .mockResolvedValueOnce(new Response(JSON.stringify({
          data: [],
        }), { status: 200 }));

      global.fetch = mockFetch;

      const { listScreenshotSets } = await import('../tools/screenshots.js');
      const result = await listScreenshotSets('loc-1');

      expect(result).toContain('APP_IPHONE_67');
      expect(result).toContain('1 screenshots');
      expect(result).toContain('APP_IPAD_PRO_129');
      expect(result).toContain('0 screenshots');
      expect(result).toContain('home.png');
      expect(result).toContain('500 KB');
      expect(result).toContain('COMPLETE');
      expect(result).toContain('No screenshots uploaded');
    });
  });

  describe('uploadScreenshotsBatch', () => {
    const PNG = '/tmp/asc_batch_test.png';

    /** Routes every ASC call and records what was asked, so tests can assert
     *  on the request shape rather than on the markdown. */
    function trackFetch(opts: { existingSets?: string[]; existingShots?: number } = {}) {
      const calls: { method: string; url: string }[] = [];
      const sets = opts.existingSets ?? [];
      const shots = opts.existingShots ?? 0;

      global.fetch = vi.fn().mockImplementation((url: any, init: any) => {
        const u = String(url);
        const method = init?.method || 'GET';
        calls.push({ method, url: u });

        if (u.includes('/appScreenshotSets') && u.includes('appStoreVersionLocalizations')) {
          return Promise.resolve(new Response(JSON.stringify({
            data: sets.map((t, i) => ({ id: `set-${i}`, attributes: { screenshotDisplayType: t } })),
          }), { status: 200 }));
        }
        if (u.endsWith('/appScreenshotSets') && method === 'POST') {
          return Promise.resolve(new Response(JSON.stringify({
            data: { id: 'set-new', attributes: { screenshotDisplayType: 'APP_IPHONE_67' } },
          }), { status: 201 }));
        }
        if (u.includes('/appScreenshots') && method === 'GET') {
          return Promise.resolve(new Response(JSON.stringify({
            data: Array.from({ length: shots }, (_, i) => ({
              id: `shot-${i}`, attributes: { fileName: `old-${i}.png` },
            })),
          }), { status: 200 }));
        }
        if (u.endsWith('/appScreenshots') && method === 'POST') {
          return Promise.resolve(new Response(JSON.stringify({
            data: {
              id: 'shot-new',
              attributes: { uploadOperations: [{ url: 'https://upload.example/1', offset: 0, length: 4, requestHeaders: [] }] },
            },
          }), { status: 201 }));
        }
        if (method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }));
        return Promise.resolve(new Response(JSON.stringify({ data: { id: 'shot-new', attributes: {} } }), { status: 200 }));
      });
      return calls;
    }

    beforeEach(async () => {
      const { writeFileSync } = await import('fs');
      writeFileSync(PNG, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });

    afterEach(async () => {
      const { existsSync, unlinkSync } = await import('fs');
      if (existsSync(PNG)) unlinkSync(PNG);
    });

    it('reuses an existing set for the display type instead of creating one', async () => {
      const calls = trackFetch({ existingSets: ['APP_IPHONE_67'] });
      const { uploadScreenshotsBatch } = await import('../tools/screenshots.js');

      const result = await uploadScreenshotsBatch('APP_IPHONE_67', [
        { versionLocalizationId: 'loc-1', filePaths: [PNG, PNG] },
      ]);

      const created = calls.filter((c) => c.method === 'POST' && c.url.endsWith('/appScreenshotSets'));
      expect(created.length).toBe(0);
      expect(result).toContain('**2** screenshot(s)');
      expect(result).toContain('**1** localization(s)');
    });

    it('creates the set when the localization has none', async () => {
      const calls = trackFetch({ existingSets: ['APP_IPAD_PRO_129'] });
      const { uploadScreenshotsBatch } = await import('../tools/screenshots.js');

      const result = await uploadScreenshotsBatch('APP_IPHONE_67', [
        { versionLocalizationId: 'loc-1', filePaths: [PNG] },
      ]);

      expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/appScreenshotSets')).length).toBe(1);
      expect(result).toContain('set created');
    });

    it('clears existing screenshots by default and skips clearing when replace is false', async () => {
      const withReplace = trackFetch({ existingSets: ['APP_IPHONE_67'], existingShots: 3 });
      const { uploadScreenshotsBatch } = await import('../tools/screenshots.js');
      await uploadScreenshotsBatch('APP_IPHONE_67', [
        { versionLocalizationId: 'loc-1', filePaths: [PNG] },
      ]);
      expect(withReplace.filter((c) => c.method === 'DELETE').length).toBe(3);

      vi.resetModules();
      const withoutReplace = trackFetch({ existingSets: ['APP_IPHONE_67'], existingShots: 3 });
      const { uploadScreenshotsBatch: again } = await import('../tools/screenshots.js');
      const result = await again('APP_IPHONE_67', [
        { versionLocalizationId: 'loc-1', filePaths: [PNG] },
      ], false);
      expect(withoutReplace.filter((c) => c.method === 'DELETE').length).toBe(0);
      expect(result).toContain('appended');
    });

    it('validates every file BEFORE uploading anything', async () => {
      // A bad path in the second locale must not leave the first one emptied.
      const calls = trackFetch({ existingSets: ['APP_IPHONE_67'], existingShots: 2 });
      const { uploadScreenshotsBatch } = await import('../tools/screenshots.js');

      await expect(
        uploadScreenshotsBatch('APP_IPHONE_67', [
          { versionLocalizationId: 'loc-1', filePaths: [PNG] },
          { versionLocalizationId: 'loc-2', filePaths: ['/tmp/asc_missing_file.png'] },
        ]),
      ).rejects.toThrow('File not found');

      expect(calls.length).toBe(0);
    });

    it('rejects an unknown display type, an empty batch and a locale with no files', async () => {
      const { uploadScreenshotsBatch } = await import('../tools/screenshots.js');
      await expect(
        uploadScreenshotsBatch('APP_WATCH_ULTRA', [{ versionLocalizationId: 'loc-1', filePaths: [PNG] }]),
      ).rejects.toThrow('Invalid displayType');
      await expect(uploadScreenshotsBatch('APP_IPHONE_67', [])).rejects.toThrow('entries is empty');
      await expect(
        uploadScreenshotsBatch('APP_IPHONE_67', [{ versionLocalizationId: 'loc-1', filePaths: [] }]),
      ).rejects.toThrow('No filePaths given');
    });
  });
});
