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

  describe('manageAppAvailability', () => {
    it('should list territories when action is get', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          data: [
            { id: 'USA', type: 'territories' },
            { id: 'TUR', type: 'territories' },
            { id: 'DEU', type: 'territories' },
          ],
        }), { status: 200 })
      );

      const { manageAppAvailability } = await import('../tools/appManagement.js');
      const result = await manageAppAvailability('app-1', 'get');

      expect(result).toContain('App Availability');
      expect(result).toContain('3 territories');
      expect(result).toContain('USA');
      expect(result).toContain('TUR');
      expect(result).toContain('DEU');
    });
  });
});
