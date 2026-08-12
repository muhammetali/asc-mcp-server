import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../auth.js', () => ({
  getToken: vi.fn(() => 'mock-jwt-token'),
}));

describe('tools/appManagement', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('getAgeRating', () => {
    it('should display all age rating fields', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: [
            { id: 'info-1', type: 'appInfos', attributes: {} },
          ],
          included: [
            {
              type: 'ageRatingDeclarations', id: 'ard-1',
              attributes: {
                alcoholTobaccoOrDrugUseOrReferences: 'NONE',
                contests: 'INFREQUENT_OR_MILD',
                gambling: false,
                gamblingSimulated: 'FREQUENT_OR_INTENSE',
                gunsOrOtherWeapons: 'NONE',
                horrorOrFearThemes: 'NONE',
                matureOrSuggestiveThemes: 'INFREQUENT_OR_MILD',
                medicalOrTreatmentInformation: 'NONE',
                profanityOrCrudeHumor: 'INFREQUENT_OR_MILD',
                sexualContentGraphicAndNudity: 'NONE',
                sexualContentOrNudity: 'NONE',
                violenceCartoonOrFantasy: 'INFREQUENT_OR_MILD',
                violenceRealistic: 'NONE',
                violenceRealisticProlongedGraphicOrSadistic: 'NONE',
                lootBox: true,
                messagingAndChat: true,
                userGeneratedContent: true,
                unrestrictedWebAccess: false,
                advertising: false,
                parentalControls: false,
                healthOrWellnessTopics: false,
                ageAssurance: false,
                kidsAgeBand: null,
                ageRatingOverride: null,
                koreaAgeRatingOverride: null,
              },
            },
          ],
        }), { status: 200 })
      );

      const { getAgeRating } = await import('../tools/appManagement.js');
      const result = await getAgeRating('app-1');

      expect(result).toContain('Age Rating Declaration');
      expect(result).toContain('ard-1');
      expect(result).toContain('FREQUENT_OR_INTENSE');
      expect(result).toContain('INFREQUENT_OR_MILD');
      expect(result).toContain('NONE');
      expect(result).toContain('true');
      expect(result).toContain('false');
      expect(result).toContain('Loot Box');
      expect(result).toContain('Gambling (Simulated)');
      expect(result).toContain('Contests');
      expect(result).toContain('Messaging and Chat');
      expect(result).toContain('User Generated Content');
    });

    it('should handle app with no age rating declaration', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: [
            { id: 'info-1', type: 'appInfos', attributes: {} },
          ],
          included: [],
        }), { status: 200 })
      );

      const { getAgeRating } = await import('../tools/appManagement.js');
      const result = await getAgeRating('app-1');

      expect(result).toContain('No age rating declaration found');
      expect(result).toContain('app-1');
    });
  });

  describe('updateAgeRating', () => {
    it('should update enum fields like gamblingSimulated', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: {
            id: 'ard-1', type: 'ageRatingDeclarations',
            attributes: {
              gamblingSimulated: 'FREQUENT_OR_INTENSE',
              contests: 'NONE',
            },
          },
        }), { status: 200 })
      );

      const { updateAgeRating } = await import('../tools/appManagement.js');
      const result = await updateAgeRating('ard-1', {
        gamblingSimulated: 'FREQUENT_OR_INTENSE',
      });

      expect(result).toContain('Age Rating Updated');
      expect(result).toContain('gamblingSimulated');
      expect(result).toContain('FREQUENT_OR_INTENSE');
      expect(result).toContain('Updated successfully');
    });

    it('should update boolean fields like lootBox', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: {
            id: 'ard-1', type: 'ageRatingDeclarations',
            attributes: { lootBox: true },
          },
        }), { status: 200 })
      );

      const { updateAgeRating } = await import('../tools/appManagement.js');
      const result = await updateAgeRating('ard-1', {
        lootBox: true,
      });

      expect(result).toContain('Age Rating Updated');
      expect(result).toContain('lootBox');
      expect(result).toContain('true');
      expect(result).toContain('Updated successfully');
    });
  });

  describe('manageAppAvailability (v2 API — appAvailabilityV2 + territoryAvailabilities)', () => {
    // Shared mock: 1st call resolves the app's single appAvailability
    // resource ID, 2nd+ call(s) page through territoryAvailabilities.
    function mockAvailabilityFlow(territories: Array<{ code: string; available: boolean }>, extraHandler?: (url: string, opts: any) => Response | null) {
      let callCount = 0;
      return vi.fn().mockImplementation((url: string, opts: any) => {
        callCount++;
        if (extraHandler) {
          const custom = extraHandler(url, opts);
          if (custom) return Promise.resolve(custom);
        }
        if (callCount === 1) {
          expect(url).toContain('/v1/apps/app-1/appAvailabilityV2');
          return Promise.resolve(new Response(JSON.stringify({
            data: { id: 'avail-1', type: 'appAvailabilities' },
          }), { status: 200 }));
        }
        expect(url).toContain('/v2/appAvailabilities/avail-1/territoryAvailabilities');
        // Regression guard (found live 2026-08-12): without `include=territory`
        // Apple omits `relationships.territory` entirely from every item —
        // `available` still comes through, but every territory code reads
        // as `undefined`. Confirmed against the real API directly (bypassing
        // the MCP transport) before landing this fix.
        expect(decodeURIComponent(url)).toContain('include=territory');
        return Promise.resolve(new Response(JSON.stringify({
          data: territories.map((t, i) => ({
            id: `ta-${i}`,
            type: 'territoryAvailabilities',
            attributes: { available: t.available },
            relationships: { territory: { data: { type: 'territories', id: t.code } } },
          })),
        }), { status: 200 }));
      });
    }

    it('should list territories with their available flag when action is get', async () => {
      global.fetch = mockAvailabilityFlow([
        { code: 'USA', available: true },
        { code: 'TUR', available: true },
        { code: 'DEU', available: false },
      ]);

      const { manageAppAvailability } = await import('../tools/appManagement.js');
      const result = await manageAppAvailability('app-1', 'get');

      expect(result).toContain('App Availability');
      expect(result).toContain('3 territories');
      expect(result).toContain('USA');
      expect(result).toContain('TUR');
      expect(result).toContain('DEU');
      // DEU is the only unavailable one — assert both states are distinguished
      const deuRow = result.split('\n').find((l) => l.includes('DEU'))!;
      expect(deuRow).toContain('No');
      const usaRow = result.split('\n').find((l) => l.includes('USA'))!;
      expect(usaRow).toContain('Yes');
    });

    it('should follow pagination (links.next) when listing territories', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({
            data: { id: 'avail-1', type: 'appAvailabilities' },
          }), { status: 200 }));
        }
        if (callCount === 2) {
          expect(url).not.toContain('cursor=');
          return Promise.resolve(new Response(JSON.stringify({
            data: [{
              id: 'ta-0', type: 'territoryAvailabilities',
              attributes: { available: true },
              relationships: { territory: { data: { type: 'territories', id: 'USA' } } },
            }],
            links: { self: url, next: 'https://api.appstoreconnect.apple.com/v2/appAvailabilities/avail-1/territoryAvailabilities?cursor=page2' },
          }), { status: 200 }));
        }
        expect(url).toContain('cursor=page2');
        return Promise.resolve(new Response(JSON.stringify({
          data: [{
            id: 'ta-1', type: 'territoryAvailabilities',
            attributes: { available: false },
            relationships: { territory: { data: { type: 'territories', id: 'TUR' } } },
          }],
        }), { status: 200 }));
      });

      const { manageAppAvailability } = await import('../tools/appManagement.js');
      const result = await manageAppAvailability('app-1', 'get');

      expect(result).toContain('2 territories');
      expect(result).toContain('USA');
      expect(result).toContain('TUR');
      expect(callCount).toBe(3);
    });

    it('should POST a compound document (included territoryAvailabilities) when removing territories from sale', async () => {
      let postBody: any;
      let postUrl = '';
      global.fetch = mockAvailabilityFlow(
        [
          { code: 'USA', available: true },
          { code: 'TUR', available: true },
          { code: 'DEU', available: true },
        ],
        (url, opts) => {
          if (opts?.method === 'POST') {
            postUrl = url;
            postBody = JSON.parse(opts.body);
            return new Response(JSON.stringify({ data: { id: 'avail-1', type: 'appAvailabilities' } }), { status: 200 });
          }
          return null;
        },
      );

      const { manageAppAvailability } = await import('../tools/appManagement.js');
      const result = await manageAppAvailability('app-1', 'remove_from_sale', ['TUR']);

      expect(postUrl).toContain('/v2/appAvailabilities');
      expect(postBody.data.type).toBe('appAvailabilities');
      expect(postBody.data.attributes.availableInNewTerritories).toBe(false);
      expect(postBody.data.relationships.app.data).toEqual({ type: 'apps', id: 'app-1' });

      // Every territory must be resubmitted (full-state replace), only TUR flipped
      expect(postBody.included).toHaveLength(3);
      const byCode = (code: string) =>
        postBody.included.find((inc: any) => inc.relationships.territory.data.id === code);
      expect(byCode('TUR').attributes.available).toBe(false);
      expect(byCode('USA').attributes.available).toBe(true);
      expect(byCode('DEU').attributes.available).toBe(true);

      // relationships.territoryAvailabilities.data must reference the SAME
      // local ids used in `included` (JSON:API compound-document linkage)
      const includedIds = new Set(postBody.included.map((inc: any) => inc.id));
      for (const ref of postBody.data.relationships.territoryAvailabilities.data) {
        expect(ref.type).toBe('territoryAvailabilities');
        expect(includedIds.has(ref.id)).toBe(true);
      }

      expect(result).toContain('Remove from Sale');
      expect(result).toContain('TUR');
      expect(result).toContain('2 of 3');
    });

    it('should throw when remove_from_sale is called without territoryCodes', async () => {
      global.fetch = mockAvailabilityFlow([{ code: 'USA', available: true }]);
      const { manageAppAvailability } = await import('../tools/appManagement.js');
      await expect(manageAppAvailability('app-1', 'remove_from_sale')).rejects.toThrow('territoryCodes is required');
    });

    it('should restore ALL territories to available when no territoryCodes given', async () => {
      let postBody: any;
      global.fetch = mockAvailabilityFlow(
        [
          { code: 'USA', available: true },
          { code: 'TUR', available: false },
          { code: 'DEU', available: false },
        ],
        (url, opts) => {
          if (opts?.method === 'POST') {
            postBody = JSON.parse(opts.body);
            return new Response(JSON.stringify({ data: { id: 'avail-1', type: 'appAvailabilities' } }), { status: 200 });
          }
          return null;
        },
      );

      const { manageAppAvailability } = await import('../tools/appManagement.js');
      const result = await manageAppAvailability('app-1', 'restore');

      expect(postBody.data.attributes.availableInNewTerritories).toBe(true);
      expect(postBody.included.every((inc: any) => inc.attributes.available === true)).toBe(true);
      expect(result).toContain('Total Territories** | 3');
      expect(result).toContain('Now Available** | 3');
    });

    it('should restore only the given territoryCodes, leaving others untouched', async () => {
      let postBody: any;
      global.fetch = mockAvailabilityFlow(
        [
          { code: 'USA', available: true },
          { code: 'TUR', available: false },
          { code: 'DEU', available: false },
        ],
        (url, opts) => {
          if (opts?.method === 'POST') {
            postBody = JSON.parse(opts.body);
            return new Response(JSON.stringify({ data: { id: 'avail-1', type: 'appAvailabilities' } }), { status: 200 });
          }
          return null;
        },
      );

      const { manageAppAvailability } = await import('../tools/appManagement.js');
      await manageAppAvailability('app-1', 'restore', ['TUR']);

      const byCode = (code: string) =>
        postBody.included.find((inc: any) => inc.relationships.territory.data.id === code);
      expect(byCode('TUR').attributes.available).toBe(true); // restored
      expect(byCode('DEU').attributes.available).toBe(false); // untouched, stays unavailable
      expect(byCode('USA').attributes.available).toBe(true); // untouched, was already available
    });

    it('should throw a clear error when the app has no appAvailabilityV2 resource', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: null }), { status: 200 }),
      );
      const { manageAppAvailability } = await import('../tools/appManagement.js');
      await expect(manageAppAvailability('app-1', 'get')).rejects.toThrow('No app availability resource found');
    });
  });
});
