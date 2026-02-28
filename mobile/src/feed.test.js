import { describe, it, expect } from 'vitest';
import { generateFeed } from './feed.js';

describe('generateFeed', () => {
  it('generates valid RSS XML with podcast and episodes', () => {
    const podcast = {
      id: 'pod1',
      title: 'Test Podcast',
      authorName: 'Dr. Test',
      imageUrl: 'https://images.example.com/podcast.jpg',
      publishedAt: '2025-06-01T00:00:00',
    };

    const episodes = [
      {
        id: 'ep1',
        title: 'Episode One',
        publishedAt: '2025-06-15T10:00:00',
        description: 'First episode description.',
        audioMediaId: 'audio1',
        imageUrl: 'https://images.example.com/ep1.jpg',
      },
      {
        id: 'ep2',
        title: 'Episode Two',
        publishedAt: '2025-07-01T10:00:00',
        description: 'Second episode description.',
        audioMediaId: 'audio2',
        imageUrl: 'https://images.example.com/ep2.jpg',
      },
    ];

    const baseUrl = 'https://bridge.example.com';
    const xml = generateFeed({ podcast, episodes, baseUrl });

    expect(xml).toContain('Test Podcast');
    expect(xml).toContain('<itunes:author>Dr. Test</itunes:author>');
    expect(xml).toContain('Episode One');
    expect(xml).toContain('Episode Two');
    expect(xml).toContain('https://bridge.example.com/audio/audio1');
    expect(xml).toContain('https://bridge.example.com/audio/audio2');
    expect(xml).toContain('https://images.example.com/podcast.jpg');
    expect(xml).toContain('https://images.example.com/ep1.jpg');
    expect(xml).toContain('<?xml');
    expect(xml).toContain('<rss');
  });

  it('handles empty episodes list', () => {
    const podcast = {
      id: 'pod1',
      title: 'Empty Podcast',
      authorName: 'Nobody',
      imageUrl: 'https://images.example.com/empty.jpg',
      publishedAt: '2025-01-01T00:00:00',
    };

    const xml = generateFeed({ podcast, episodes: [], baseUrl: 'https://example.com' });
    expect(xml).toContain('Empty Podcast');
    expect(xml).not.toContain('<item>');
  });
});
