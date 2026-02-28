# LifeFlow Bridge Mobile App — Design Document

## Problem

Life Network (app.joinlifenetwork.com) hosts health/wellness podcasts behind a member login. There's no way to consume these podcasts in a standard podcast player. We want an Android app that bridges Life Network's API to any installed podcast player (Podcast Addict, etc.) via a local HTTP server serving RSS feeds.

## Solution

A React Native (Expo) Android app that runs a lightweight local HTTP server in the background. The server authenticates with Life Network's API, generates standard podcast RSS feeds, and proxies audio URLs. Users subscribe to localhost feed URLs in their existing podcast player.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   User's Phone                        │
│                                                       │
│  ┌──────────────┐          ┌───────────────────────┐ │
│  │ Podcast Addict│ ──────> │ LifeFlow Bridge App   │ │
│  │ (or any app) │ RSS feed │                        │ │
│  │              │ <─────── │ Local HTTP Server      │ │
│  │              │          │   :8080                │ │
│  │              │ audio    │         │              │ │
│  │              │ redirect │         ▼              │ │
│  │              │ <─────── │ LN API Client ────>───┤─┼──> Life Network API
│  └──────────────┘          │                        │ │
│                            │ Foreground Service     │ │
│                            │ (keeps server alive)   │ │
│                            └───────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## User Flow

1. Install app, enter Life Network email + password
2. App authenticates, shows list of all podcasts with artwork
3. Tap "Subscribe" on any podcast → opens Podcast Addict with feed URL pre-filled
4. Podcast Addict handles playback, downloads, tracking from there
5. App runs quietly in background with minimal foreground notification

## Life Network API (reverse-engineered)

**Base URL:** `https://api.prod.next.golifenetwork.com`

### Authentication

- **Login:** `POST /account/login` — body: `{ "email": "...", "password": "..." }` — returns `{ "authToken": "..." }`
- **Refresh:** `POST /account/session/refresh` with `x-auth-token` header — returns `{ "freshAuthToken": "..." }`
- All authenticated requests use `x-auth-token` header

### Content Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/content/podcast?pageIndex=0&pageSize=100` | GET | List all podcast shows |
| `/content/podcast/{podcastId}` | GET | Podcast metadata + episode ID sequence |
| `/content/podcast/{podcastId}/episode?pageIndex=0&pageSize=300` | GET | All episodes for a podcast |
| `/content/podcast/{podcastId}/episode/{episodeId}` | GET | Episode detail (title, show notes, audioMediaId) |
| `/media/audio/{audioMediaId}` | GET | Returns signed Cloudflare R2 URL (24h expiry) for MP3 |
| `/tag` | GET | All tags |
| `/content/contributor-by-profile/{profileId}` | GET | Contributor/author info |

### Data Shapes

**Podcast (show):**
```json
{
  "id": "6852ee4daec43f01a65d74ca",
  "authorProfileId": "673e7371d21745bfebea0bbc",
  "title": "LIFE | Lounge Voices",
  "tagIds": ["..."],
  "publishedAt": "2025-06-18T12:31:41.015",
  "heroImageId": "1136d80c-312b-4d81-9bb9-50e59cbaab01"
}
```

**Episode detail body:**
```json
{
  "showNotes": "[{\"type\":\"p\",\"children\":[{\"text\":\"...\"}]}]",
  "audioMediaId": "68c5a47a5af1e973a3e697b3"
}
```

**Audio media response:**
```json
{
  "data": { "id": "...", "name": "episode.mp3" },
  "renderURL": "https://uploaded-audio...r2.cloudflarestorage.com/...?X-Amz-Expires=86400&X-Amz-Signature=..."
}
```

**Images:** `https://imagedelivery.net/0UfIQ3lQQ7vsurILwUoUag/{imageId}/public`

## Tech Stack

- **Framework:** React Native + Expo (custom dev client for native modules)
- **HTTP Server:** Native Android module wrapping NanoHTTPD (lightweight Java HTTP server)
- **Background:** react-native-background-actions for foreground service
- **Storage:** AsyncStorage for credentials and cached data
- **RSS:** rss npm package (same as server version) for feed generation
- **UI:** React Native core components

## App Screens

### 1. Login Screen
- Email + password fields
- "Sign In" button
- Credentials stored securely in AsyncStorage
- Shown once until user logs out

### 2. Podcasts Screen (main)
- List of all Life Network podcasts with artwork + title
- Each row has "Subscribe in Podcast Addict" button
- Status indicator: server running / stopped
- Server auto-starts on app launch

### 3. Settings Screen
- Logout button
- Server port (default 8080)
- Cache duration setting
- Battery optimization instructions / link to Android settings

## Local HTTP Server

### Endpoints

| Route | Purpose |
|---|---|
| `GET /feed/:podcastId` | RSS/XML feed for one podcast show |
| `GET /audio/:mediaId` | Fetches fresh signed URL, 302 redirects to Cloudflare R2 |

### Feed Generation

1. Request comes in from Podcast Addict
2. Check in-memory cache (1 hour TTL)
3. If stale: fetch podcast metadata + episodes + episode details from LN API
4. Parse show notes from rich text JSON to plain text
5. Generate RSS XML with iTunes extensions
6. Audio enclosure URLs point to `http://localhost:8080/audio/{mediaId}`
7. Cache result, return XML

### Audio Proxy

1. Podcast Addict requests `http://localhost:8080/audio/{mediaId}`
2. Server calls LN API `/media/audio/{mediaId}` for fresh signed URL
3. Returns 302 redirect to Cloudflare R2 signed URL
4. Podcast Addict streams directly from R2

## Battery Optimization

- HTTP server is event-driven (sleeps when idle, no polling)
- LN API responses cached for 1 hour
- Auth token refreshed only on-demand when stale (not on a timer)
- No periodic background network calls
- Foreground service with minimal silent notification
- User instructed to set app to "Unrestricted" battery optimization

## Error Handling

- Invalid credentials → server returns error, app shows notification to re-login
- LN API down → serve stale cache if available, otherwise 503
- Server killed by Android → foreground service auto-restarts
- Token expired mid-request → auto-refresh token, retry once

## Open Source Considerations

- Users provide their own Life Network credentials
- No central server or costs
- Each user runs their own instance on their phone
- MIT or similar permissive license
- README with setup instructions and battery optimization guide
