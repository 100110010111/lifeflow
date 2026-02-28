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
