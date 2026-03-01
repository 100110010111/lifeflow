const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let _BackgroundService = null;
let _generateFeeds = null;
let _HttpServer = null;

function getBackgroundService() {
  if (!_BackgroundService) {
    _BackgroundService = require('react-native-background-actions').default;
  }
  return _BackgroundService;
}

async function backgroundTask(params) {
  const { email, password, port } = params;

  // Lazy-load native module and dependencies
  _HttpServer = await import('../modules/http-server');
  const { createLNClient } = await import('./ln-client.js');
  const { generateFeed } = await import('./feed.js');
  const { parseShowNotes } = await import('./show-notes.js');

  // Authenticate
  const client = createLNClient({ email, password });
  await client.login();

  // Start HTTP server
  await _HttpServer.start(port);

  // Define feed generation function
  _generateFeeds = async () => {
    const items = await client.getPodcasts();
    _HttpServer.clearFeeds();
    _HttpServer.clearAudioUrls();

    for (const item of items) {
      const podcast = item.content;
      try {
        const [podcastData, episodeList] = await Promise.all([
          client.getPodcast(podcast.id),
          client.getEpisodes(podcast.id),
        ]);

        const episodeDetails = await Promise.all(
          episodeList.map(ep =>
            client.getEpisodeDetail(podcast.id, ep.content.id).catch(() => null)
          )
        );

        let authorName = 'Life Network';
        try {
          const contributor = await client.getContributor(podcastData.metadata.authorProfileId);
          if (contributor?.profile?.userProfile) {
            const p = contributor.profile.userProfile;
            authorName = `${p.firstName || ''} ${p.lastName || ''}`.trim() || authorName;
          }
        } catch {}

        const episodes = episodeList.map((ep, i) => {
          const detail = episodeDetails[i];
          return {
            id: ep.content.id,
            title: ep.content.title,
            publishedAt: ep.content.publishedAt,
            description: detail ? parseShowNotes(detail.body?.showNotes) : '',
            audioMediaId: detail?.body?.audioMediaId || null,
            imageUrl: ep.renderURL || item.renderURL || '',
          };
        });

        const xml = generateFeed({
          podcast: {
            id: podcast.id,
            title: podcastData.metadata.title,
            authorName,
            imageUrl: item.renderURL || '',
            publishedAt: podcastData.metadata.publishedAt,
          },
          episodes,
          baseUrl: `http://localhost:${port}`,
        });

        _HttpServer.setFeed(podcast.id, xml);

        // Pre-fetch audio URLs
        await Promise.all(
          episodes.filter(ep => ep.audioMediaId).map(async (ep) => {
            try {
              const signedUrl = await client.getAudioUrl(ep.audioMediaId);
              _HttpServer.setAudioUrl(ep.audioMediaId, signedUrl);
            } catch {}
          })
        );
      } catch (err) {
        console.warn(`[LifeFlow] Feed generation failed for ${podcast.title}:`, err?.message || err);
      }
    }
  };

  // Generate feeds initially
  await _generateFeeds();

  // Keep alive: refresh token + regenerate feeds every 30 min
  const BgService = getBackgroundService();
  while (BgService.isRunning()) {
    await sleep(30 * 60 * 1000);
    try {
      await client.refreshToken();
      await _generateFeeds();
    } catch (err) {
      console.warn('[LifeFlow] Refresh failed:', err?.message || err);
    }
  }
}

const options = {
  taskName: 'LifeFlow Bridge',
  taskTitle: 'LifeFlow Bridge',
  taskDesc: 'Serving podcast feeds on localhost',
  taskIcon: {
    name: 'ic_launcher',
    type: 'mipmap',
  },
  color: '#1a1a2e',
  parameters: {
    email: '',
    password: '',
    port: 8080,
  },
};

export async function startBackgroundService({ email, password, port = 8080 }) {
  const BgService = getBackgroundService();
  if (BgService.isRunning()) {
    return;
  }

  await BgService.start(backgroundTask, {
    ...options,
    parameters: { email, password, port },
  });
}

export async function stopBackgroundService() {
  if (_HttpServer) {
    try { await _HttpServer.stop(); } catch {}
  }
  const BgService = getBackgroundService();
  await BgService.stop();
  _generateFeeds = null;
  _HttpServer = null;
}

export function isBackgroundServiceRunning() {
  const BgService = getBackgroundService();
  return BgService.isRunning();
}
