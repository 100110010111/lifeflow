# LifeFlow Bridge

An Android app that connects your [Life Network](https://app.joinlifenetwork.com) account to any podcast player.

LifeFlow Bridge runs a local HTTP server on your phone that generates standard RSS podcast feeds from your Life Network subscription. Subscribe in Podcast Addict, AntennaPod, or any podcast app that supports RSS feeds.

## How It Works

1. Sign in with your Life Network credentials
2. Tap **Start Feed Server** to start a local server on `localhost:8080`
3. Tap **Subscribe** on any podcast to add it to your podcast player
4. Episodes stream directly from Life Network's servers

Keep the app open while listening — feeds and auth tokens refresh automatically every 30 minutes.

## Building

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- An [Expo](https://expo.dev/) account (free)
- [EAS CLI](https://docs.expo.dev/eas/): `npm install -g eas-cli`

### Setup

```bash
cd mobile
npm install
eas login
eas init
```

### Build APK

```bash
eas build --platform android --profile preview
```

This builds in the cloud — no Android SDK or Java required. Download the APK from the link EAS provides and install on your phone.

### Development

Run tests:
```bash
npm test
```

Bundle check:
```bash
npx expo export --platform android
```

## Architecture

- **Expo 55** with custom dev client (for native module support)
- **NanoHTTPD** (Kotlin) — lightweight HTTP server running on-device
- **Static feed generation** — RSS XML is pre-generated in JavaScript and pushed to the native server as static content
- **expo-secure-store** — credentials stored encrypted on-device

## Project Structure

```
mobile/
├── App.js                          # Entry point with error boundary
├── modules/http-server/            # Kotlin NanoHTTPD native module
│   ├── android/.../HttpServerModule.kt
│   └── index.ts                    # JS bridge
├── src/
│   ├── screens/
│   │   ├── LoginScreen.js          # Life Network login
│   │   └── PodcastsScreen.js       # Podcast list + server control
│   ├── auth.js                     # Secure credential storage
│   ├── feed.js                     # Pure-JS RSS+iTunes feed generator
│   ├── ln-client.js                # Life Network API client
│   └── show-notes.js               # Rich text to plain text parser
└── plugins/
    ├── withCleartextTraffic.js      # Allow localhost HTTP
    └── withForegroundServiceType.js # Android 14+ service type
```

## Tips

- **Keep app open**: The feed server runs while the app is in the foreground. Keep it open (or in recent apps) while listening.
- **Battery optimization**: Go to Settings > Apps > LifeFlow Bridge > Battery > Unrestricted. This helps prevent Android from killing the app.
- **Feed refresh**: Feeds and auth tokens refresh automatically every 30 minutes while the server is running.
- **Audio URLs**: Episode audio uses signed URLs that expire in 24 hours. They're refreshed along with feeds.

## License

MIT
