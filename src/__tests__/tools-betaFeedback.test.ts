import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth
vi.mock('../auth.js', () => ({
  getToken: vi.fn().mockResolvedValue('mock-token'),
}));

describe('tools/betaFeedback', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('fetches and formats TestFlight feedback', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('betaFeedbackScreenshotSubmissions')) {
        return Promise.resolve(new Response(JSON.stringify({
          data: [{
            id: 'fb-1',
            type: 'betaFeedbackScreenshotSubmissions',
            attributes: { feedback: 'App looks great but needs dark mode', device: 'iPhone 15', osVersion: '17.2' },
            relationships: { tester: { data: { id: 'tester-1', type: 'betaTesters' } }, build: { data: { id: 'b-1', type: 'builds' } } }
          }],
          included: [
            { type: 'betaTesters', id: 'tester-1', attributes: { email: 'test@example.com' } },
            { type: 'builds', id: 'b-1', attributes: { version: '1.2.0', buildVersion: '42' } }
          ]
        }), { status: 200 }));
      }
      if (url.includes('betaFeedbackCrashSubmissions')) {
        return Promise.resolve(new Response(JSON.stringify({
          data: [{
            id: 'crash-1',
            type: 'betaFeedbackCrashSubmissions',
            attributes: { feedback: 'It crashed on launch', device: 'iPad Pro', osVersion: '17.3' },
            relationships: { tester: { data: { id: 'tester-2', type: 'betaTesters' } } }
          }],
          included: [
            { type: 'betaTesters', id: 'tester-2', attributes: { firstName: 'John' } }
          ]
        }), { status: 200 }));
      }
      return Promise.resolve(new Response('Not found', { status: 404 }));
    });

    const { getTestFlightFeedback } = await import('../tools/betaFeedback.js');
    const result = await getTestFlightFeedback('app-123');

    expect(result).toContain('TestFlight Beta Feedback');
    expect(result).toContain('App looks great but needs dark mode');
    expect(result).toContain('It crashed on launch');
    expect(result).toContain('test@example.com');
    expect(result).toContain('John');
    expect(result).toContain('1.2.0 (42)');
    expect(result).toContain('iPhone 15');
    expect(result).toContain('iPad Pro');
  });

  it('handles empty feedback', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [], included: [] }), { status: 200 }));
    const { getTestFlightFeedback } = await import('../tools/betaFeedback.js');
    const result = await getTestFlightFeedback('app-123');
    expect(result).toContain('No feedback found');
  });
});
