# LifeFlow Bridge — Design Document

## Problem

Life Network (app.joinlifenetwork.com) hosts health/wellness podcasts behind a member login. There's no way to consume these podcasts in a standard podcast player. We want to bridge Life Network's internal API to generate standard podcast RSS feeds.

## Solution

A lightweight Node.js + Express server ("LifeFlow Bridge") that authenticates with Life Network's API, fetches podcast/episode data, and serves standard RSS feeds consumable by any podcast app.

## Architecture

```
┌─────────────┐     subscribe to     ┌──────────────────┐     fetch data     ┌─────────────────────┐
│  Podcast App │ ──────────────────> │  LifeFlow Bridge │ ──────────────────> │  Life Network API   │
│  (on phone)  │ <────────────────── │  (small VPS)     │ <────────────────── │  (their servers)    │
│              │     RSS + audio      │                  │     JSON + MP3      │                     │
└─────────────┘                       └──────────────────┘                     └─────────────────────┘
```

## Life Network API (reverse-engineered)

**Base URL:** `https://api.prod.next.golifenetwork.com`

### Authentication

- **Login:** `POST /account/login` — body: `{ "email": "...", "password": "..." }` — returns `{ "authToken": "..." }`
- **Refresh:** `POST /account/session/refresh` with `x-auth-token` header — returns `{ "freshAuthToken": "..." }`
- All authenticated requests use `x-auth-token` header

### Content Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/content/podcast?pageIndex=0&pageSize=30` | GET | List all podcast shows |
| `/content/podcast/{podcastId}` | GET | Podcast metadata + episode ID sequence |
| `/content/podcast/{podcastId}/episode?pageIndex=0&pageSize=300` | GET | All episodes for a podcast |
| `/content/podcast/{podcastId}/episode/{episodeId}` | GET | Episode detail (title, show notes, audioMediaId, videoMediaId) |
| `/media/audio/{audioMediaId}` | GET | Returns signed Cloudflare R2 URL (24h expiry) for MP3 |
| `/tag` | GET | All tags (Biohacking, Sleep, Nutrition, etc.) |
| `/content/contributor-by-profile/{profileId}` | GET | Contributor/author info |
| `/bookmark/{contentId}` | GET/POST | Playback position tracking |

### Data Shapes

**Podcast (show):**
```json
{
  "id": "6852ee4daec43f01a65d74ca",
  "authorProfileId": "673e7371d21745bfebea0bbc",
  "title": "LIFE | Lounge Voices",
  "tagIds": ["67170c5054ac2538d44c566c", "..."],
  "publishedAt": "2025-06-18T12:31:41.015",
  "heroImageId": "1136d80c-312b-4d81-9bb9-50e59cbaab01"
}
```

**Episode:**
```json
{
  "metadata": {
    "id": "68c59c835af1e973a3e69772",
    "parentContentId": "6852ee4daec43f01a65d74ca",
    "title": "Fixing Gut Issues Naturally...",
    "publishedAt": "2025-09-13T10:14:00.161",
    "heroImageId": "5c8783ab-fb42-4352-2837-fb04392f1701"
  },
  "body": {
    "showNotes": "[{\"type\":\"p\",\"children\":[{\"text\":\"...\"}]}]",
    "audioMediaId": "68c5a47a5af1e973a3e697b3",
    "videoMediaId": "68c5a6225af1e973a3e697b4"
  }
}
```

**Audio media:**
```json
{
  "data": {
    "id": "68c5a47a5af1e973a3e697b3",
    "name": "LL UnBoxed Dr Vincent Perdre.mp3"
  },
  "renderURL": "https://uploaded-audio...r2.cloudflarestorage.com/68c5a47a5af1e973a3e697b3?X-Amz-Algorithm=...&X-Amz-Expires=86400&X-Amz-Signature=..."
}
```

**Images:** Served via `https://imagedelivery.net/0UfIQ3lQQ7vsurILwUoUag/{imageId}/public`

## Server Design

### Tech Stack

- **Runtime:** Node.js
- **Framework:** Express
- **RSS generation:** `rss` npm package
- **Config:** `.env` file for credentials
- **Deployment:** Any VPS, Railway, Fly.io, etc.

### Endpoints

| Route | Purpose |
|---|---|
| `GET /` | Dashboard listing all podcast feeds with subscribe links |
| `GET /feed/:podcastId` | RSS/XML feed for one podcast show |
| `GET /audio/:mediaId` | Fetches fresh signed URL, 302 redirects to Cloudflare R2 |

### Auth Flow

1. On startup, server calls `POST /account/login` with credentials from `.env`
2. Stores `authToken` in memory
3. Refreshes token every 30 minutes via `POST /account/session/refresh`
4. All API calls use `x-auth-token` header

### RSS Feed Generation

Each feed at `/feed/:podcastId`:
1. Fetches podcast metadata from `/content/podcast/{podcastId}`
2. Fetches all episodes from `/content/podcast/{podcastId}/episode?pageIndex=0&pageSize=300`
3. Fetches contributor info for author name
4. Generates standard podcast RSS with iTunes extensions
5. Episode `<enclosure>` URLs point to `/audio/:mediaId` on the bridge server
6. Caches feed data for 15 minutes to avoid hammering the API

### Audio Proxy

`GET /audio/:mediaId`:
1. Calls Life Network `/media/audio/{mediaId}` to get fresh signed URL
2. Returns `302 Redirect` to the signed Cloudflare R2 URL
3. Podcast app follows redirect and streams directly from R2

### Show Notes

Episode show notes are stored as a JSON array of rich text nodes. The server parses these into plain text for the RSS `<description>` field.

### Security

- Server protected with basic auth or shared API key (`BRIDGE_SECRET` in `.env`)
- Feed URLs include the secret: `/feed/:podcastId?key=YOUR_SECRET`
- Life Network credentials never exposed to clients

## Configuration

```env
LN_EMAIL=your-email@example.com
LN_PASSWORD=your-password
BRIDGE_SECRET=a-random-secret-for-feed-access
PORT=3000
```

## Fallback Plan

If the RSS bridge approach has issues (e.g., podcast apps don't handle the audio redirect well), fall back to building a custom React Native/Expo mobile app that connects directly to the Life Network API with a built-in audio player.
