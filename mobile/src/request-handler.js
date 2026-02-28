import { generateFeed } from './feed.js';
import { parseShowNotes } from './show-notes.js';

export function createRequestHandler({ client, baseUrl }) {
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

  return async function handleRequest(uri, method, query) {
    // Route: /audio/:mediaId
    const audioMatch = uri.match(/^\/audio\/([a-zA-Z0-9]+)$/);
    if (audioMatch) {
      try {
        const mediaId = audioMatch[1];
        const signedUrl = await client.getAudioUrl(mediaId);
        return {
          statusCode: 302,
          contentType: 'text/plain',
          body: '',
          locationHeader: signedUrl,
        };
      } catch (err) {
        return { statusCode: 500, contentType: 'text/plain', body: 'Error fetching audio URL' };
      }
    }

    // Route: /feed/:podcastId
    const feedMatch = uri.match(/^\/feed\/([a-zA-Z0-9]+)$/);
    if (feedMatch) {
      try {
        const podcastId = feedMatch[1];
        const cacheKey = `feed:${podcastId}`;

        const xml = await cached(cacheKey, 60 * 60 * 1000, async () => {
          const [podcastData, episodeList] = await Promise.all([
            client.getPodcast(podcastId),
            client.getEpisodes(podcastId),
          ]);

          const episodeDetails = await Promise.all(
            episodeList.map(ep =>
              client.getEpisodeDetail(podcastId, ep.content.id).catch(() => null)
            )
          );

          let authorName = 'Life Network';
          try {
            const contributor = await cached(
              `contributor:${podcastData.metadata.authorProfileId}`,
              24 * 60 * 60 * 1000,
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

          return generateFeed({ podcast, episodes, baseUrl });
        });

        return {
          statusCode: 200,
          contentType: 'application/rss+xml; charset=utf-8',
          body: xml,
        };
      } catch (err) {
        return { statusCode: 500, contentType: 'text/plain', body: 'Error generating feed' };
      }
    }

    return { statusCode: 404, contentType: 'text/plain', body: 'Not found' };
  };
}
