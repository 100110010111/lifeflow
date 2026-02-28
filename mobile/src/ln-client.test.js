import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLNClient } from './ln-client.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('LNClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('login', () => {
    it('sends email and password, stores auth token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ authToken: 'test-token-123' }),
      });

      const client = createLNClient({ email: 'test@example.com', password: 'pass123' });
      await client.login();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.prod.next.golifenetwork.com/account/login',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com', password: 'pass123' }),
        })
      );
    });
  });

  describe('getPodcasts', () => {
    it('fetches podcast list with auth token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ authToken: 'tok' }),
      });
      const client = createLNClient({ email: 'a@b.com', password: 'p' });
      await client.login();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          result: {
            items: [
              { content: { id: 'pod1', title: 'Show One', authorProfileId: 'auth1', tagIds: [], publishedAt: '2025-01-01T00:00:00', heroImageId: 'img1' } }
            ]
          }
        }),
      });

      const podcasts = await client.getPodcasts();
      expect(podcasts).toHaveLength(1);
      expect(podcasts[0].content.title).toBe('Show One');
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://api.prod.next.golifenetwork.com/content/podcast?pageIndex=0&pageSize=100',
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-auth-token': 'tok' }),
        })
      );
    });
  });

  describe('getEpisodes', () => {
    it('fetches episodes for a podcast', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ authToken: 'tok' }),
      });
      const client = createLNClient({ email: 'a@b.com', password: 'p' });
      await client.login();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          result: {
            items: [
              { content: { id: 'ep1', title: 'Episode One', parentContentId: 'pod1', episodeBodyId: 'body1', publishedAt: '2025-06-01T00:00:00', heroImageId: 'img2' } }
            ]
          }
        }),
      });

      const episodes = await client.getEpisodes('pod1');
      expect(episodes).toHaveLength(1);
      expect(episodes[0].content.title).toBe('Episode One');
    });
  });

  describe('getEpisodeDetail', () => {
    it('fetches episode detail with audioMediaId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ authToken: 'tok' }),
      });
      const client = createLNClient({ email: 'a@b.com', password: 'p' });
      await client.login();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          metadata: { id: 'ep1', title: 'Episode One', publishedAt: '2025-06-01T00:00:00' },
          body: { showNotes: '[{"type":"p","children":[{"text":"Hello world"}]}]', audioMediaId: 'audio123' },
        }),
      });

      const detail = await client.getEpisodeDetail('pod1', 'ep1');
      expect(detail.body.audioMediaId).toBe('audio123');
    });
  });

  describe('getAudioUrl', () => {
    it('fetches signed audio URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ authToken: 'tok' }),
      });
      const client = createLNClient({ email: 'a@b.com', password: 'p' });
      await client.login();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { id: 'audio123', name: 'episode.mp3' },
          renderURL: 'https://r2.example.com/audio123?sig=abc',
        }),
      });

      const url = await client.getAudioUrl('audio123');
      expect(url).toBe('https://r2.example.com/audio123?sig=abc');
    });
  });

  describe('refreshToken', () => {
    it('refreshes the auth token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ authToken: 'tok' }),
      });
      const client = createLNClient({ email: 'a@b.com', password: 'p' });
      await client.login();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ freshAuthToken: 'new-tok' }),
      });

      await client.refreshToken();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: { items: [] } }),
      });
      await client.getPodcasts();
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-auth-token': 'new-tok' }),
        })
      );
    });
  });
});
