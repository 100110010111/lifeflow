import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequestHandler } from './request-handler.js';

describe('createRequestHandler', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      getPodcast: vi.fn(),
      getEpisodes: vi.fn(),
      getEpisodeDetail: vi.fn(),
      getContributor: vi.fn(),
      getAudioUrl: vi.fn(),
    };
  });

  it('returns 404 for unknown paths', async () => {
    const handler = createRequestHandler({ client: mockClient, baseUrl: 'http://localhost:8080' });
    const result = await handler('/unknown', 'GET', '');
    expect(result.statusCode).toBe(404);
  });

  it('handles audio redirect', async () => {
    mockClient.getAudioUrl.mockResolvedValue('https://r2.example.com/audio?sig=abc');
    const handler = createRequestHandler({ client: mockClient, baseUrl: 'http://localhost:8080' });
    const result = await handler('/audio/media123', 'GET', '');
    expect(result.statusCode).toBe(302);
    expect(result.locationHeader).toBe('https://r2.example.com/audio?sig=abc');
  });

  it('handles feed request', async () => {
    mockClient.getPodcast.mockResolvedValue({
      metadata: { title: 'Test Pod', authorProfileId: 'auth1', heroImageId: 'img1', publishedAt: '2025-01-01T00:00:00' },
    });
    mockClient.getEpisodes.mockResolvedValue([]);
    mockClient.getContributor.mockResolvedValue({
      profile: { userProfile: { firstName: 'Dr', lastName: 'Test' } },
    });

    const handler = createRequestHandler({ client: mockClient, baseUrl: 'http://localhost:8080' });
    const result = await handler('/feed/pod123', 'GET', '');
    expect(result.statusCode).toBe(200);
    expect(result.contentType).toBe('application/rss+xml; charset=utf-8');
    expect(result.body).toContain('Test Pod');
  });
});
