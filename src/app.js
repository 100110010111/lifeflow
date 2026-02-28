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

        return generateFeed({
          podcast,
          episodes,
          baseUrl,
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
