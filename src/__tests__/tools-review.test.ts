import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../auth.js', () => ({
  getToken: vi.fn(() => 'mock-jwt-token'),
}));

describe('tools/review', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('submitForReview', () => {
    it('should reject if version is not in PREPARE_FOR_SUBMISSION state', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: { id: 'v1', attributes: { versionString: '2.0.0', appStoreState: 'READY_FOR_SALE', platform: 'IOS' } },
          included: [],
        }), { status: 200 })
      );

      const { submitForReview } = await import('../tools/review.js');
      const result = await submitForReview('v1');

      expect(result).toContain('Error');
      expect(result).toContain('READY_FOR_SALE');
      expect(result).toContain('PREPARE_FOR_SUBMISSION');
    });

    it('should reject if no build is attached', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: { id: 'v1', attributes: { versionString: '2.0.0', appStoreState: 'PREPARE_FOR_SUBMISSION', platform: 'IOS' } },
          included: [],
        }), { status: 200 })
      );

      const { submitForReview } = await import('../tools/review.js');
      const result = await submitForReview('v1');

      expect(result).toContain('Error');
      expect(result).toContain('No build attached');
      expect(result).toContain('asc_assign_build');
    });

    it('should reject if build is not VALID', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: { id: 'v1', attributes: { versionString: '2.0.0', appStoreState: 'PREPARE_FOR_SUBMISSION', platform: 'IOS' } },
          included: [
            { type: 'builds', id: 'b1', attributes: { version: '42', processingState: 'PROCESSING' } },
          ],
        }), { status: 200 })
      );

      const { submitForReview } = await import('../tools/review.js');
      const result = await submitForReview('v1');

      expect(result).toContain('Error');
      expect(result).toContain('PROCESSING');
      expect(result).toContain('VALID');
    });

    it('should reject if encryption declaration is not set', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: { id: 'v1', attributes: { versionString: '2.0.0', appStoreState: 'PREPARE_FOR_SUBMISSION', platform: 'IOS' } },
          included: [
            { type: 'builds', id: 'b1', attributes: { version: '42', processingState: 'VALID', usesNonExemptEncryption: null } },
            { type: 'appStoreVersionLocalizations', id: 'loc-1', attributes: { locale: 'en-US', description: 'Great app', whatsNew: 'Fixes' } },
          ],
        }), { status: 200 })
      );

      const { submitForReview } = await import('../tools/review.js');
      const result = await submitForReview('v1');

      expect(result).toContain('Error');
      expect(result).toContain('encryption');
      expect(result).toContain('asc_set_encryption');
    });

    it('should reject if What\'s New is empty for any locale', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: { id: 'v1', attributes: { versionString: '2.0.0', appStoreState: 'PREPARE_FOR_SUBMISSION', platform: 'IOS' } },
          included: [
            { type: 'builds', id: 'b1', attributes: { version: '42', processingState: 'VALID', usesNonExemptEncryption: false } },
            { type: 'appStoreVersionLocalizations', id: 'loc-1', attributes: { locale: 'en-US', description: 'Great app', whatsNew: 'Fixes' } },
            { type: 'appStoreVersionLocalizations', id: 'loc-2', attributes: { locale: 'tr', description: 'Harika uygulama', whatsNew: null } },
          ],
        }), { status: 200 })
      );

      const { submitForReview } = await import('../tools/review.js');
      const result = await submitForReview('v1');

      expect(result).toContain('Error');
      expect(result).toContain("Empty What's New");
      expect(result).toContain('tr');
    });

    it('should reject if descriptions are empty', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: { id: 'v1', attributes: { versionString: '2.0.0', appStoreState: 'PREPARE_FOR_SUBMISSION', platform: 'IOS' } },
          included: [
            { type: 'builds', id: 'b1', attributes: { version: '42', processingState: 'VALID', usesNonExemptEncryption: false } },
            { type: 'appStoreVersionLocalizations', id: 'loc-1', attributes: { locale: 'en-US', description: 'Great app', whatsNew: 'Fixes' } },
            { type: 'appStoreVersionLocalizations', id: 'loc-2', attributes: { locale: 'tr', description: null, whatsNew: 'Düzeltmeler' } },
          ],
        }), { status: 200 })
      );

      const { submitForReview } = await import('../tools/review.js');
      const result = await submitForReview('v1');

      expect(result).toContain('Error');
      expect(result).toContain('Empty description');
      expect(result).toContain('tr');
    });

    it('should submit successfully using new reviewSubmissions API', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string, options?: any) => {
        callCount++;
        if (callCount === 1) {
          // Pre-flight GET (version details with build, locs)
          return Promise.resolve(new Response(JSON.stringify({
            data: {
              id: 'v1',
              attributes: { versionString: '2.0.0', appStoreState: 'PREPARE_FOR_SUBMISSION', platform: 'IOS' },
              relationships: { app: { data: { type: 'apps', id: 'app-1' } } },
            },
            included: [
              { type: 'builds', id: 'b1', attributes: { version: '42', processingState: 'VALID', usesNonExemptEncryption: false } },
              { type: 'appStoreVersionLocalizations', id: 'loc-1', attributes: { locale: 'en-US', description: 'Great app', whatsNew: 'Fixes' } },
            ],
          }), { status: 200 }));
        }
        if (callCount === 2) {
          // POST /v1/reviewSubmissions
          return Promise.resolve(new Response(JSON.stringify({
            data: { id: 'rs-1', type: 'reviewSubmissions', attributes: { state: 'READY_FOR_REVIEW' } },
          }), { status: 201 }));
        }
        if (callCount === 3) {
          // POST /v1/reviewSubmissionItems
          return Promise.resolve(new Response(JSON.stringify({
            data: { id: 'rsi-1', type: 'reviewSubmissionItems' },
          }), { status: 201 }));
        }
        // PATCH /v1/reviewSubmissions/:id (submit)
        return Promise.resolve(new Response(JSON.stringify({
          data: { id: 'rs-1', type: 'reviewSubmissions', attributes: { state: 'WAITING_FOR_REVIEW' } },
        }), { status: 200 }));
      });

      const { submitForReview } = await import('../tools/review.js');
      const result = await submitForReview('v1');

      expect(result).toContain('## Submitted for Review');
      expect(result).toContain('2.0.0');
      expect(result).toContain('42');
      expect(result).toContain('24-48 hours');
      expect(result).toContain('rs-1'); // Submission ID
      expect(callCount).toBe(4); // 1 GET + 3 POST/PATCH
    });
  });

  describe('getReviewSubmission', () => {
    it('should warn about missing demo account when required', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: { id: 'v1', attributes: { versionString: '2.0.0', appStoreState: 'WAITING_FOR_REVIEW', platform: 'IOS' } },
          included: [
            {
              type: 'appStoreReviewDetails', id: 'rd-1',
              attributes: {
                contactFirstName: 'Ali', contactLastName: 'M',
                contactEmail: 'ali@test.com', contactPhone: '+1234',
                demoAccountRequired: true, demoAccountName: null, demoAccountPassword: null,
                notes: 'Some notes',
              },
            },
          ],
        }), { status: 200 })
      );

      const { getReviewSubmission } = await import('../tools/review.js');
      const result = await getReviewSubmission('v1');

      expect(result).toContain('CRITICAL');
      expect(result).toContain('Demo account is required but credentials are missing');
    });

    it('should mask demo password in output', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: { id: 'v1', attributes: { versionString: '2.0.0', appStoreState: 'IN_REVIEW', platform: 'IOS' } },
          included: [
            {
              type: 'appStoreReviewDetails', id: 'rd-1',
              attributes: {
                contactFirstName: 'Ali', contactLastName: 'M',
                contactEmail: null, contactPhone: null,
                demoAccountRequired: true, demoAccountName: 'testuser', demoAccountPassword: 'secret123',
                notes: null,
              },
            },
          ],
        }), { status: 200 })
      );

      const { getReviewSubmission } = await import('../tools/review.js');
      const result = await getReviewSubmission('v1');

      expect(result).toContain('(set)');
      expect(result).not.toContain('secret123');
    });
  });

  describe('getRejectionReasons', () => {
    it('should show common rejection patterns', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('filter')) {
          return Promise.resolve(new Response(JSON.stringify({
            data: [
              { id: 'v1', attributes: { versionString: '1.9.0', appStoreState: 'REJECTED', platform: 'IOS', createdDate: '2026-02-15T00:00:00Z' } },
            ],
          }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({
          data: { id: 'v1', attributes: {} },
          included: [],
        }), { status: 200 }));
      });

      const { getRejectionReasons } = await import('../tools/review.js');
      const result = await getRejectionReasons('app-1');

      expect(result).toContain('## Rejection History');
      expect(result).toContain('v1.9.0');
      expect(result).toContain('4.3 Spam');
      expect(result).toContain('5.1.1 Privacy');
      // Should NOT contain hardcoded app name
      expect(result).not.toContain('GoyGoyChat');
    });

    it('should handle no rejections gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      );

      const { getRejectionReasons } = await import('../tools/review.js');
      const result = await getRejectionReasons('app-1');

      expect(result).toContain('No rejected versions found');
    });
  });
});
