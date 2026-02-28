const IMAGE_BASE = 'https://imagedelivery.net/0UfIQ3lQQ7vsurILwUoUag';

function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateFeed({ podcast, episodes, baseUrl }) {
  const imageUrl = podcast.heroImageId
    ? `${IMAGE_BASE}/${podcast.heroImageId}/public`
    : '';
  const author = podcast.authorName || 'Life Network';
  const description = `${podcast.title} — via LifeFlow Bridge`;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>${escapeXml(podcast.title)}</title>
    <description>${escapeXml(description)}</description>
    <link>https://app.joinlifenetwork.com/podcasts/${escapeXml(podcast.id)}</link>
    <pubDate>${new Date(podcast.publishedAt).toUTCString()}</pubDate>
    <itunes:author>${escapeXml(author)}</itunes:author>
    <itunes:summary>${escapeXml(description)}</itunes:summary>`;

  if (imageUrl) {
    xml += `
    <image>
      <url>${escapeXml(imageUrl)}</url>
      <title>${escapeXml(podcast.title)}</title>
      <link>https://app.joinlifenetwork.com/podcasts/${escapeXml(podcast.id)}</link>
    </image>
    <itunes:image href="${escapeXml(imageUrl)}" />`;
  }

  for (const ep of episodes) {
    const epImageUrl = ep.heroImageId
      ? `${IMAGE_BASE}/${ep.heroImageId}/public`
      : imageUrl;
    const epDescription = ep.description || '';

    xml += `
    <item>
      <title>${escapeXml(ep.title)}</title>
      <description>${escapeXml(epDescription)}</description>
      <link>https://app.joinlifenetwork.com/podcasts/${escapeXml(podcast.id)}/${escapeXml(ep.id)}</link>
      <guid isPermaLink="false">${escapeXml(ep.id)}</guid>
      <pubDate>${new Date(ep.publishedAt).toUTCString()}</pubDate>
      <itunes:author>${escapeXml(author)}</itunes:author>
      <itunes:summary>${escapeXml(epDescription)}</itunes:summary>`;

    if (ep.audioMediaId) {
      xml += `
      <enclosure url="${escapeXml(baseUrl)}/audio/${escapeXml(ep.audioMediaId)}" type="audio/mpeg" />`;
    }

    if (epImageUrl) {
      xml += `
      <itunes:image href="${escapeXml(epImageUrl)}" />`;
    }

    xml += `
    </item>`;
  }

  xml += `
  </channel>
</rss>`;

  return xml;
}
