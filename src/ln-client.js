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
