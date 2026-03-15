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
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: [
            {
              id: 'set-1', attributes: { screenshotDisplayType: 'APP_IPHONE_67' },
              relationships: { appScreenshots: { data: [{ id: 'ss-1' }] } },
            },
            {
              id: 'set-2', attributes: { screenshotDisplayType: 'APP_IPAD_PRO_129' },
              relationships: { appScreenshots: { data: [] } },
            },
          ],
          included: [
            { type: 'appScreenshots', id: 'ss-1', attributes: { fileName: 'home.png', fileSize: 512000, assetDeliveryState: { state: 'COMPLETE' } } },
          ],
        }), { status: 200 })
      );

      const { listScreenshotSets } = await import('../tools/screenshots.js');
      const result = await listScreenshotSets('loc-1');

      expect(result).toContain('APP_IPHONE_67');
      expect(result).toContain('APP_IPAD_PRO_129');
      expect(result).toContain('home.png');
      expect(result).toContain('500 KB');
      expect(result).toContain('COMPLETE');
      expect(result).toContain('No screenshots uploaded');
    });
  });
});
