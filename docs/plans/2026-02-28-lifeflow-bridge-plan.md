# LifeFlow Bridge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Node.js server that bridges Life Network's internal API to standard podcast RSS feeds.

**Architecture:** Express server authenticates with Life Network, fetches podcast catalogs, generates RSS feeds per show, and proxies audio URLs via 302 redirects to handle expiring signed URLs. Protected with a shared secret key.

**Tech Stack:** Node.js 24, Express, `rss` package, `dotenv`, `vitest` for testing

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `src/index.js`

**Step 1: Initialize project and install dependencies**

Run:
```bash
cd C:/Users/user/lifeflow
npm init -y
npm install express dotenv rss
npm install -D vitest
```

**Step 2: Create .gitignore**

Create `.gitignore`:
```
node_modules/
.env
```

**Step 3: Create .env.example**

Create `.env.example`:
```env
LN_EMAIL=your-email@example.com
LN_PASSWORD=your-password
BRIDGE_SECRET=change-me-to-a-random-string
PORT=3000
BASE_URL=http://localhost:3000
```

**Step 4: Create .env with real credentials**

Copy `.env.example` to `.env` and fill in real values. `BASE_URL` is the public URL podcast apps will use to reach this server (e.g., `http://localhost:3000` for local dev, or your VPS domain later).

**Step 5: Create minimal src/index.js entry point**

Create `src/index.js`:
```js
import 'dotenv/config';
import { createApp } from './app.js';

const port = process.env.PORT || 3000;

const app = createApp();
app.listen(port, () => {
  console.log(`LifeFlow Bridge running on port ${port}`);
});
```

**Step 6: Add package.json scripts and set type to module**

Add to `package.json`:
```json
{
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Step 7: Initialize git and commit**

Run:
```bash
git init
git add package.json package-lock.json .gitignore .env.example src/index.js
git commit -m "chore: scaffold project with dependencies"
```

---

### Task 2: Life Network API Client

**Files:**
- Create: `src/ln-client.js`
- Create: `src/ln-client.test.js`

This module wraps all Life Network API calls. It handles login, token refresh, and all content fetching.

**Step 1: Write the failing test**

Create `src/ln-client.test.js`:
```js
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
      // Login first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ authToken: 'tok' }),
      });
      const client = createLNClient({ email: 'a@b.com', password: 'p' });
      await client.login();

      // Podcast list
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
      // Next call should use new token
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/ln-client.test.js`
Expected: FAIL — module `./ln-client.js` not found

**Step 3: Write the implementation**

Create `src/ln-client.js`:
```js
const BASE = 'https://api.prod.next.golifenetwork.com';

export function createLNClient({ email, password }) {
  let authToken = null;

  async function apiFetch(path, options = {}) {
    const headers = { ...options.headers };
    if (authToken) {
      headers['x-auth-token'] = authToken;
    }
    const res = await fetch(`${BASE}${path}`, { ...options, headers });
    if (!res.ok) {
      throw new Error(`LN API error: ${res.status} ${res.statusText} on ${path}`);
    }
    return res.json();
  }

  return {
    async login() {
      const data = await fetch(`${BASE}/account/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!data.ok) {
        throw new Error(`Login failed: ${data.status}`);
      }
      const json = await data.json();
      authToken = json.authToken;
    },

    async refreshToken() {
      const data = await apiFetch('/account/session/refresh', { method: 'POST' });
      authToken = data.freshAuthToken;
    },

    async getPodcasts() {
      const data = await apiFetch('/content/podcast?pageIndex=0&pageSize=100');
      return data.result.items;
    },

    async getPodcast(podcastId) {
      return apiFetch(`/content/podcast/${podcastId}`);
    },

    async getEpisodes(podcastId) {
      const data = await apiFetch(`/content/podcast/${podcastId}/episode?pageIndex=0&pageSize=300`);
      return data.result.items;
    },

    async getEpisodeDetail(podcastId, episodeId) {
      return apiFetch(`/content/podcast/${podcastId}/episode/${episodeId}`);
    },

    async getAudioUrl(mediaId) {
      const data = await apiFetch(`/media/audio/${mediaId}`);
      return data.renderURL;
    },

    async getContributor(profileId) {
      return apiFetch(`/content/contributor-by-profile/${profileId}`);
    },

    async getTags() {
      return apiFetch('/tag');
    },
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ln-client.test.js`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add src/ln-client.js src/ln-client.test.js
git commit -m "feat: add Life Network API client with auth and content fetching"
```

---

### Task 3: Show Notes Parser

**Files:**
- Create: `src/show-notes.js`
- Create: `src/show-notes.test.js`

Life Network stores show notes as a JSON array of rich text nodes. We need to convert this to plain text for RSS descriptions.

**Step 1: Write the failing test**

Create `src/show-notes.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { parseShowNotes } from './show-notes.js';

describe('parseShowNotes', () => {
  it('extracts plain text from rich text nodes', () => {
    const notes = JSON.stringify([
      { type: 'p', children: [{ text: 'First paragraph.' }], id: 'a' },
      { type: 'p', children: [{ text: 'Second paragraph.' }], id: 'b' },
    ]);
    expect(parseShowNotes(notes)).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('handles empty/null input', () => {
    expect(parseShowNotes(null)).toBe('');
    expect(parseShowNotes('')).toBe('');
    expect(parseShowNotes('[]')).toBe('');
  });

  it('handles nodes with multiple children', () => {
    const notes = JSON.stringify([
      { type: 'p', children: [{ text: 'Hello ' }, { text: 'world' }], id: 'a' },
    ]);
    expect(parseShowNotes(notes)).toBe('Hello world');
  });

  it('skips empty paragraphs', () => {
    const notes = JSON.stringify([
      { type: 'p', children: [{ text: 'Content' }], id: 'a' },
      { type: 'p', children: [{ text: '\n' }], id: 'b' },
      { type: 'p', children: [{ text: 'More content' }], id: 'c' },
    ]);
    expect(parseShowNotes(notes)).toBe('Content\n\nMore content');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/show-notes.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/show-notes.js`:
```js
export function parseShowNotes(notesJson) {
  if (!notesJson) return '';

  let nodes;
  try {
    nodes = JSON.parse(notesJson);
  } catch {
    return '';
  }

  if (!Array.isArray(nodes) || nodes.length === 0) return '';

  return nodes
    .map(node => {
      if (!node.children) return '';
      return node.children.map(child => child.text || '').join('');
    })
    .map(text => text.trim())
    .filter(text => text.length > 0)
    .join('\n\n');
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/show-notes.test.js`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/show-notes.js src/show-notes.test.js
git commit -m "feat: add show notes parser for rich text to plain text"
```

---

### Task 4: RSS Feed Generator

**Files:**
- Create: `src/feed.js`
- Create: `src/feed.test.js`

Generates a standard podcast RSS feed with iTunes extensions for a given podcast and its episodes.

**Step 1: Write the failing test**

Create `src/feed.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { generateFeed } from './feed.js';

describe('generateFeed', () => {
  it('generates valid RSS XML with podcast and episodes', () => {
    const podcast = {
      id: 'pod1',
      title: 'Test Podcast',
      authorName: 'Dr. Test',
      heroImageId: 'img-abc',
      publishedAt: '2025-06-01T00:00:00',
    };

    const episodes = [
      {
        id: 'ep1',
        title: 'Episode One',
        publishedAt: '2025-06-15T10:00:00',
        description: 'First episode description.',
        audioMediaId: 'audio1',
        heroImageId: 'img-ep1',
      },
      {
        id: 'ep2',
        title: 'Episode Two',
        publishedAt: '2025-07-01T10:00:00',
        description: 'Second episode description.',
        audioMediaId: 'audio2',
        heroImageId: 'img-ep2',
      },
    ];

    const baseUrl = 'https://bridge.example.com';
    const xml = generateFeed({ podcast, episodes, baseUrl });

    expect(xml).toContain('<title>Test Podcast</title>');
    expect(xml).toContain('<itunes:author>Dr. Test</itunes:author>');
    expect(xml).toContain('<title>Episode One</title>');
    expect(xml).toContain('<title>Episode Two</title>');
    expect(xml).toContain('https://bridge.example.com/audio/audio1');
    expect(xml).toContain('https://bridge.example.com/audio/audio2');
    expect(xml).toContain('<?xml');
    expect(xml).toContain('<rss');
  });

  it('handles empty episodes list', () => {
    const podcast = {
      id: 'pod1',
      title: 'Empty Podcast',
      authorName: 'Nobody',
      heroImageId: 'img-abc',
      publishedAt: '2025-01-01T00:00:00',
    };

    const xml = generateFeed({ podcast, episodes: [], baseUrl: 'https://example.com' });
    expect(xml).toContain('<title>Empty Podcast</title>');
    expect(xml).not.toContain('<item>');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/feed.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/feed.js`:
```js
import RSS from 'rss';

const IMAGE_BASE = 'https://imagedelivery.net/0UfIQ3lQQ7vsurILwUoUag';

export function generateFeed({ podcast, episodes, baseUrl }) {
  const imageUrl = podcast.heroImageId
    ? `${IMAGE_BASE}/${podcast.heroImageId}/public`
    : undefined;

  const feed = new RSS({
    title: podcast.title,
    description: `${podcast.title} — via LifeFlow Bridge`,
    feed_url: `${baseUrl}/feed/${podcast.id}`,
    site_url: `https://app.joinlifenetwork.com/podcasts/${podcast.id}`,
    image_url: imageUrl,
    pubDate: new Date(podcast.publishedAt),
    custom_namespaces: {
      itunes: 'http://www.itunes.com/dtds/podcast-1.0.dtd',
    },
    custom_elements: [
      { 'itunes:author': podcast.authorName || 'Life Network' },
      { 'itunes:summary': `${podcast.title} — via LifeFlow Bridge` },
      imageUrl
        ? { 'itunes:image': { _attr: { href: imageUrl } } }
        : null,
    ].filter(Boolean),
  });

  for (const ep of episodes) {
    const epImageUrl = ep.heroImageId
      ? `${IMAGE_BASE}/${ep.heroImageId}/public`
      : imageUrl;

    feed.item({
      title: ep.title,
      description: ep.description || '',
      url: `https://app.joinlifenetwork.com/podcasts/${podcast.id}/${ep.id}`,
      guid: ep.id,
      date: new Date(ep.publishedAt),
      enclosure: ep.audioMediaId
        ? { url: `${baseUrl}/audio/${ep.audioMediaId}`, type: 'audio/mpeg' }
        : undefined,
      custom_elements: [
        { 'itunes:author': podcast.authorName || 'Life Network' },
        { 'itunes:summary': ep.description || '' },
        epImageUrl
          ? { 'itunes:image': { _attr: { href: epImageUrl } } }
          : null,
      ].filter(Boolean),
    });
  }

  return feed.xml({ indent: true });
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/feed.test.js`
Expected: All 2 tests PASS

**Step 5: Commit**

```bash
git add src/feed.js src/feed.test.js
git commit -m "feat: add RSS feed generator with iTunes extensions"
```

---

### Task 5: Express App with Routes

**Files:**
- Create: `src/app.js`
- Create: `src/app.test.js`

The main Express app with all three routes: index, feed, and audio redirect.

**Step 1: Write the failing test**

Create `src/app.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We'll test the route handlers with a mock LN client
// For integration-style tests, we use supertest-like manual testing

import { createApp } from './app.js';

describe('createApp', () => {
  it('returns an express app', () => {
    const app = createApp({ lnClient: {} });
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe('function');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/app.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/app.js`:
```js
import express from 'express';
import { createLNClient } from './ln-client.js';
import { generateFeed } from './feed.js';
import { parseShowNotes } from './show-notes.js';

export function createApp({ lnClient } = {}) {
  const app = express();

  // Initialize LN client if not injected (for testing)
  const client = lnClient || createLNClient({
    email: process.env.LN_EMAIL,
    password: process.env.LN_PASSWORD,
  });

  const secret = process.env.BRIDGE_SECRET;
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

  // Simple cache: { key: { data, expiry } }
  const cache = new Map();
  function cached(key, ttlMs, fetcher) {
    const entry = cache.get(key);
    if (entry && entry.expiry > Date.now()) return Promise.resolve(entry.data);
    return fetcher().then(data => {
      cache.set(key, { data, expiry: Date.now() + ttlMs });
      return data;
    });
  }

  // Auth middleware
  function checkSecret(req, res, next) {
    if (!secret) return next(); // No secret configured = open access
    if (req.query.key === secret) return next();
    res.status(401).send('Unauthorized — provide ?key=YOUR_SECRET');
  }

  // Startup: login and schedule token refresh
  let initialized = false;
  async function ensureInitialized() {
    if (initialized) return;
    await client.login();
    initialized = true;
    // Refresh token every 30 minutes
    setInterval(async () => {
      try {
        await client.refreshToken();
      } catch (err) {
        console.error('Token refresh failed, re-logging in:', err.message);
        try {
          await client.login();
        } catch (loginErr) {
          console.error('Re-login failed:', loginErr.message);
        }
      }
    }, 30 * 60 * 1000);
  }

  // GET / — Dashboard
  app.get('/', checkSecret, async (req, res) => {
    try {
      await ensureInitialized();
      const podcasts = await cached('podcasts', 15 * 60 * 1000, () => client.getPodcasts());

      const keyParam = secret ? `?key=${secret}` : '';
      const html = `<!DOCTYPE html>
<html><head><title>LifeFlow Bridge</title>
<style>body{font-family:system-ui;max-width:800px;margin:2rem auto;padding:0 1rem;background:#1a1a2e;color:#e0e0e0}
a{color:#6db3f2}h1{color:#fff}.podcast{margin:1.5rem 0;padding:1rem;background:#16213e;border-radius:8px}
.podcast h2{margin:0 0 0.5rem}</style></head>
<body><h1>LifeFlow Bridge</h1><p>Subscribe to any feed URL in your podcast app.</p>
${podcasts.map(p => `<div class="podcast">
  <h2>${p.content.title}</h2>
  <code>${baseUrl}/feed/${p.content.id}${keyParam}</code>
</div>`).join('')}
</body></html>`;
      res.send(html);
    } catch (err) {
      console.error('Dashboard error:', err);
      res.status(500).send('Error loading podcasts');
    }
  });

  // GET /feed/:podcastId — RSS feed
  app.get('/feed/:podcastId', checkSecret, async (req, res) => {
    try {
      await ensureInitialized();
      const { podcastId } = req.params;
      const cacheKey = `feed:${podcastId}`;

      const xml = await cached(cacheKey, 15 * 60 * 1000, async () => {
        const [podcastData, episodeList] = await Promise.all([
          client.getPodcast(podcastId),
          client.getEpisodes(podcastId),
        ]);

        // Fetch episode details in parallel (for audioMediaId and show notes)
        const episodeDetails = await Promise.all(
          episodeList.map(ep =>
            client.getEpisodeDetail(podcastId, ep.content.id).catch(() => null)
          )
        );

        // Try to get author name
        let authorName = 'Life Network';
        try {
          const contributor = await cached(
            `contributor:${podcastData.metadata.authorProfileId}`,
            60 * 60 * 1000,
            () => client.getContributor(podcastData.metadata.authorProfileId)
          );
          if (contributor?.profile?.userProfile) {
            const p = contributor.profile.userProfile;
            authorName = `${p.firstName || ''} ${p.lastName || ''}`.trim() || authorName;
          }
        } catch {}

        const podcast = {
          id: podcastId,
          title: podcastData.metadata.title,
          authorName,
          heroImageId: podcastData.metadata.heroImageId,
          publishedAt: podcastData.metadata.publishedAt,
        };

        const episodes = episodeList.map((ep, i) => {
          const detail = episodeDetails[i];
          return {
            id: ep.content.id,
            title: ep.content.title,
            publishedAt: ep.content.publishedAt,
            description: detail ? parseShowNotes(detail.body?.showNotes) : '',
            audioMediaId: detail?.body?.audioMediaId || null,
            heroImageId: ep.content.heroImageId,
          };
        });

        const keyParam = secret ? `?key=${secret}` : '';
        return generateFeed({
          podcast,
          episodes,
          baseUrl: `${baseUrl}${keyParam ? '' : ''}`,
        });
      });

      res.set('Content-Type', 'application/rss+xml; charset=utf-8');
      res.send(xml);
    } catch (err) {
      console.error('Feed error:', err);
      res.status(500).send('Error generating feed');
    }
  });

  // GET /audio/:mediaId — Redirect to signed audio URL
  app.get('/audio/:mediaId', async (req, res) => {
    try {
      await ensureInitialized();
      const { mediaId } = req.params;
      const signedUrl = await client.getAudioUrl(mediaId);
      res.redirect(302, signedUrl);
    } catch (err) {
      console.error('Audio redirect error:', err);
      res.status(500).send('Error fetching audio URL');
    }
  });

  return app;
}
```

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/app.js src/app.test.js
git commit -m "feat: add Express app with dashboard, RSS feed, and audio redirect routes"
```

---

### Task 6: Update Entry Point and Manual Integration Test

**Files:**
- Modify: `src/index.js`

**Step 1: Update src/index.js to use createApp properly**

The entry point already calls `createApp()` which now works. Verify it's correct:

```js
import 'dotenv/config';
import { createApp } from './app.js';

const port = process.env.PORT || 3000;

const app = createApp();
app.listen(port, () => {
  console.log(`LifeFlow Bridge running on port ${port}`);
  console.log(`Dashboard: http://localhost:${port}/${process.env.BRIDGE_SECRET ? '?key=' + process.env.BRIDGE_SECRET : ''}`);
});
```

**Step 2: Ensure .env is configured with real credentials**

Verify `.env` has:
```
LN_EMAIL=lifenetwork@ghost-ocean.com
LN_PASSWORD=<your-password>
BRIDGE_SECRET=<pick-something>
PORT=3000
BASE_URL=http://localhost:3000
```

**Step 3: Start the server and test manually**

Run: `npm start`

Then in a browser:
1. Visit `http://localhost:3000/?key=YOUR_SECRET` — should show dashboard with podcast list
2. Click a feed URL — should return RSS XML
3. Copy `/audio/:mediaId` URL from the XML and visit it — should redirect to R2

**Step 4: Commit**

```bash
git add src/index.js
git commit -m "feat: finalize entry point with dashboard URL logging"
```

---

### Task 7: Fix Audio URL in RSS Feed (key passthrough)

**Files:**
- Modify: `src/feed.js`
- Modify: `src/app.js`

The audio URLs in the RSS feed need to NOT require the secret key (since podcast apps won't know it), OR we need to pass the key through. The simplest approach: audio endpoint is unauthenticated (it only redirects, doesn't expose data listings).

**Step 1: Verify audio endpoint has no checkSecret middleware**

Looking at the code in Task 5, `/audio/:mediaId` already has no `checkSecret` — this is correct. Audio URLs are opaque media IDs, not browsable. No change needed.

**Step 2: Commit (if any changes were made)**

No commit needed — this was a verification step.

---

## Summary

| Task | What it builds | Key files |
|---|---|---|
| 1 | Project scaffolding | `package.json`, `.env.example`, `src/index.js` |
| 2 | Life Network API client | `src/ln-client.js` |
| 3 | Show notes parser | `src/show-notes.js` |
| 4 | RSS feed generator | `src/feed.js` |
| 5 | Express app with routes | `src/app.js` |
| 6 | Entry point + manual test | `src/index.js` |
| 7 | Verify audio URL security | (verification only) |

After Task 6, the server is fully functional. Start it with `npm start`, grab a feed URL from the dashboard, and paste it into your podcast app.
