# LifeFlow Bridge Mobile App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a React Native (Expo) Android app that runs a local HTTP server serving Life Network podcast RSS feeds to any installed podcast player.

**Architecture:** Expo app with a custom native Android module (Kotlin) wrapping NanoHTTPD for the local HTTP server. The server handles dynamic RSS feed generation and audio URL proxying. A foreground service keeps the server alive in the background. Existing pure-JS modules (LN API client, show notes parser, RSS generator) are reused from the Node.js server project.

**Tech Stack:** React Native, Expo (custom dev client), Kotlin (NanoHTTPD wrapper), react-native-background-actions, expo-secure-store, rss npm package

---

### Task 1: Expo Project Scaffolding

**Files:**
- Create: `mobile/` directory (new Expo project)
- Create: `mobile/app.json`
- Create: `mobile/package.json`

**Step 1: Create Expo project**

Run from `C:/Users/user/lifeflow`:
```bash
npx create-expo-app@latest mobile --template blank
```

**Step 2: Install dependencies**

```bash
cd mobile
npx expo install expo-secure-store
npm install react-native-background-actions rss
npm install -D vitest
```

**Step 3: Configure app.json**

Edit `mobile/app.json` — set the app name, package name, and Android permissions:
```json
{
  "expo": {
    "name": "LifeFlow Bridge",
    "slug": "lifeflow-bridge",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "lifeflow",
    "platforms": ["android"],
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#1a1a2e"
      },
      "package": "com.lifeflow.bridge",
      "permissions": [
        "FOREGROUND_SERVICE",
        "WAKE_LOCK"
      ]
    },
    "plugins": [
      "expo-secure-store"
    ]
  }
}
```

**Step 4: Add vitest config and test script**

Add to `mobile/package.json` scripts:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Create `mobile/vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/**/*.test.js'],
  },
});
```

**Step 5: Create src directory structure**

```bash
mkdir -p mobile/src
```

**Step 6: Commit**

```bash
cd C:/Users/user/lifeflow
git add mobile/
git commit -m "chore: scaffold Expo mobile app with dependencies"
```

---

### Task 2: Port Pure JS Modules

**Files:**
- Create: `mobile/src/ln-client.js` (copy from `src/ln-client.js`)
- Create: `mobile/src/ln-client.test.js` (copy from `src/ln-client.test.js`)
- Create: `mobile/src/show-notes.js` (copy from `src/show-notes.js`)
- Create: `mobile/src/show-notes.test.js` (copy from `src/show-notes.test.js`)
- Create: `mobile/src/feed.js` (copy from `src/feed.js`)
- Create: `mobile/src/feed.test.js` (copy from `src/feed.test.js`)

These modules are pure JS using only `fetch` and the `rss` npm package. They should work in React Native without changes.

**Step 1: Copy the modules**

```bash
cp src/ln-client.js mobile/src/ln-client.js
cp src/ln-client.test.js mobile/src/ln-client.test.js
cp src/show-notes.js mobile/src/show-notes.js
cp src/show-notes.test.js mobile/src/show-notes.test.js
cp src/feed.js mobile/src/feed.js
cp src/feed.test.js mobile/src/feed.test.js
```

**Step 2: Run tests to verify they pass**

```bash
cd mobile
npx vitest run
```

Expected: All 12 tests pass (6 ln-client + 4 show-notes + 2 feed).

**Step 3: Commit**

```bash
cd C:/Users/user/lifeflow
git add mobile/src/
git commit -m "feat: port pure JS modules to mobile app"
```

---

### Task 3: HTTP Server Native Module (Kotlin)

**Files:**
- Create: `mobile/modules/http-server/` (Expo local module)
- Create: `mobile/modules/http-server/android/src/main/java/expo/modules/httpserver/HttpServerModule.kt`
- Create: `mobile/modules/http-server/index.ts`
- Create: `mobile/modules/http-server/expo-module.config.json`

This is the core native module. It wraps NanoHTTPD to run a local HTTP server on Android, bridging requests to JavaScript for handling.

**Step 1: Create the local Expo module scaffold**

```bash
cd mobile
npx create-expo-module@latest --local http-server
```

This creates `mobile/modules/http-server/` with boilerplate. We'll replace the generated code.

**Step 2: Add NanoHTTPD dependency**

Edit `mobile/modules/http-server/android/build.gradle` — add NanoHTTPD to dependencies:
```gradle
dependencies {
    implementation 'org.nanohttpd:nanohttpd:2.3.1'
}
```

**Step 3: Write the Kotlin module**

Replace the generated Kotlin module at `mobile/modules/http-server/android/src/main/java/expo/modules/httpserver/HttpServerModule.kt`:

```kotlin
package expo.modules.httpserver

import android.os.Bundle
import androidx.core.os.bundleOf
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import fi.iki.elonen.NanoHTTPD
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

data class PendingResponse(
    val statusCode: Int,
    val contentType: String,
    val body: String,
    val headers: Map<String, String>
)

class HttpServerModule : Module() {
    private var server: LifeFlowServer? = null
    private val pendingRequests = ConcurrentHashMap<String, CompletableFuture<PendingResponse>>()

    override fun definition() = ModuleDefinition {
        Name("HttpServer")

        Events("onRequest")

        AsyncFunction("start") { port: Int ->
            if (server != null) {
                server?.stop()
            }
            server = LifeFlowServer(port, this@HttpServerModule)
            server?.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false)
            return@AsyncFunction true
        }

        AsyncFunction("stop") {
            server?.stop()
            server = null
            // Cancel all pending requests
            pendingRequests.values.forEach {
                it.complete(PendingResponse(503, "text/plain", "Server stopping", emptyMap()))
            }
            pendingRequests.clear()
            return@AsyncFunction true
        }

        Function("respond") { requestId: String, statusCode: Int, contentType: String, body: String, locationHeader: String? ->
            val headers = mutableMapOf<String, String>()
            if (locationHeader != null) {
                headers["Location"] = locationHeader
            }
            pendingRequests[requestId]?.complete(
                PendingResponse(statusCode, contentType, body, headers)
            )
        }

        Function("isRunning") {
            return@Function server?.isAlive == true
        }
    }

    fun handleRequest(uri: String, method: String, queryString: String?): PendingResponse {
        val requestId = UUID.randomUUID().toString()
        val future = CompletableFuture<PendingResponse>()
        pendingRequests[requestId] = future

        sendEvent("onRequest", bundleOf(
            "requestId" to requestId,
            "uri" to uri,
            "method" to method,
            "query" to (queryString ?: "")
        ))

        return try {
            future.get(30, TimeUnit.SECONDS)
        } catch (e: Exception) {
            PendingResponse(504, "text/plain", "Request timeout", emptyMap())
        } finally {
            pendingRequests.remove(requestId)
        }
    }

    inner class LifeFlowServer(port: Int, private val module: HttpServerModule) : NanoHTTPD(port) {
        override fun serve(session: IHTTPSession): Response {
            val result = module.handleRequest(
                session.uri,
                session.method.name,
                session.queryParameterString
            )

            val response = newFixedLengthResponse(
                Response.Status.lookup(result.statusCode) ?: Response.Status.INTERNAL_ERROR,
                result.contentType,
                result.body
            )

            for ((key, value) in result.headers) {
                response.addHeader(key, value)
            }

            return response
        }
    }
}
```

**Step 4: Write the TypeScript/JS bridge**

Replace `mobile/modules/http-server/index.ts`:
```ts
import { requireNativeModule, EventEmitter, Subscription } from 'expo-modules-core';

const HttpServerModule = requireNativeModule('HttpServer');
const emitter = new EventEmitter(HttpServerModule);

export type RequestEvent = {
  requestId: string;
  uri: string;
  method: string;
  query: string;
};

export async function start(port: number): Promise<boolean> {
  return HttpServerModule.start(port);
}

export async function stop(): Promise<boolean> {
  return HttpServerModule.stop();
}

export function respond(
  requestId: string,
  statusCode: number,
  contentType: string,
  body: string,
  locationHeader?: string
): void {
  HttpServerModule.respond(requestId, statusCode, contentType, body, locationHeader ?? null);
}

export function isRunning(): boolean {
  return HttpServerModule.isRunning();
}

export function addRequestListener(
  listener: (event: RequestEvent) => void
): Subscription {
  return emitter.addListener('onRequest', listener);
}
```

**Step 5: Verify module config**

Ensure `mobile/modules/http-server/expo-module.config.json` contains:
```json
{
  "platforms": ["android"],
  "android": {
    "modules": ["expo.modules.httpserver.HttpServerModule"]
  }
}
```

**Step 6: Commit**

```bash
cd C:/Users/user/lifeflow
git add mobile/modules/
git commit -m "feat: add HTTP server native module wrapping NanoHTTPD"
```

---

### Task 4: Request Handler

**Files:**
- Create: `mobile/src/request-handler.js`
- Create: `mobile/src/request-handler.test.js`

This module routes incoming HTTP requests to the appropriate handler (feed generation or audio redirect).

**Step 1: Write the test**

Create `mobile/src/request-handler.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequestHandler } from './request-handler.js';

describe('createRequestHandler', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      getPodcast: vi.fn(),
      getEpisodes: vi.fn(),
      getEpisodeDetail: vi.fn(),
      getContributor: vi.fn(),
      getAudioUrl: vi.fn(),
    };
  });

  it('returns 404 for unknown paths', async () => {
    const handler = createRequestHandler({ client: mockClient, baseUrl: 'http://localhost:8080' });
    const result = await handler('/unknown', 'GET', '');
    expect(result.statusCode).toBe(404);
  });

  it('handles audio redirect', async () => {
    mockClient.getAudioUrl.mockResolvedValue('https://r2.example.com/audio?sig=abc');
    const handler = createRequestHandler({ client: mockClient, baseUrl: 'http://localhost:8080' });
    const result = await handler('/audio/media123', 'GET', '');
    expect(result.statusCode).toBe(302);
    expect(result.locationHeader).toBe('https://r2.example.com/audio?sig=abc');
  });

  it('handles feed request', async () => {
    mockClient.getPodcast.mockResolvedValue({
      metadata: { title: 'Test Pod', authorProfileId: 'auth1', heroImageId: 'img1', publishedAt: '2025-01-01T00:00:00' },
    });
    mockClient.getEpisodes.mockResolvedValue([]);
    mockClient.getContributor.mockResolvedValue({
      profile: { userProfile: { firstName: 'Dr', lastName: 'Test' } },
    });

    const handler = createRequestHandler({ client: mockClient, baseUrl: 'http://localhost:8080' });
    const result = await handler('/feed/pod123', 'GET', '');
    expect(result.statusCode).toBe(200);
    expect(result.contentType).toBe('application/rss+xml; charset=utf-8');
    expect(result.body).toContain('Test Pod');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd mobile && npx vitest run src/request-handler.test.js
```
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `mobile/src/request-handler.js`:
```js
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
    const audioMatch = uri.match(/^\/audio\/([a-f0-9]+)$/);
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
    const feedMatch = uri.match(/^\/feed\/([a-f0-9]+)$/);
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
```

**Step 4: Run tests**

```bash
cd mobile && npx vitest run src/request-handler.test.js
```
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
cd C:/Users/user/lifeflow
git add mobile/src/request-handler.js mobile/src/request-handler.test.js
git commit -m "feat: add HTTP request handler with feed and audio routes"
```

---

### Task 5: Server Bridge (connects native module to JS handler)

**Files:**
- Create: `mobile/src/server.js`

This module wires the native HTTP server module to the JS request handler. It manages the server lifecycle: start, stop, handle requests.

**Step 1: Write the implementation**

Create `mobile/src/server.js`:
```js
import * as HttpServer from '../modules/http-server';
import { createLNClient } from './ln-client.js';
import { createRequestHandler } from './request-handler.js';

let subscription = null;
let client = null;
let handleRequest = null;

export async function startServer({ email, password, port = 8080 }) {
  if (HttpServer.isRunning()) {
    return;
  }

  client = createLNClient({ email, password });
  await client.login();

  handleRequest = createRequestHandler({
    client,
    baseUrl: `http://localhost:${port}`,
  });

  // Listen for incoming HTTP requests from native module
  subscription = HttpServer.addRequestListener(async (event) => {
    const { requestId, uri, method, query } = event;
    try {
      const response = await handleRequest(uri, method, query);
      HttpServer.respond(
        requestId,
        response.statusCode,
        response.contentType,
        response.body,
        response.locationHeader || null
      );
    } catch (err) {
      HttpServer.respond(requestId, 500, 'text/plain', 'Internal server error', null);
    }
  });

  await HttpServer.start(port);
}

export async function stopServer() {
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
  await HttpServer.stop();
  client = null;
  handleRequest = null;
}

export function isServerRunning() {
  return HttpServer.isRunning();
}

export async function refreshToken() {
  if (client) {
    try {
      await client.refreshToken();
    } catch {
      // Token refresh failed — will retry on next request
    }
  }
}
```

**Step 2: Commit**

```bash
cd C:/Users/user/lifeflow
git add mobile/src/server.js
git commit -m "feat: add server bridge connecting native HTTP module to JS handler"
```

---

### Task 6: Background Service

**Files:**
- Create: `mobile/src/background-service.js`

Uses react-native-background-actions to run the HTTP server as an Android foreground service with a persistent notification.

**Step 1: Write the implementation**

Create `mobile/src/background-service.js`:
```js
import BackgroundService from 'react-native-background-actions';
import { startServer, stopServer, refreshToken } from './server.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function backgroundTask(params) {
  const { email, password, port } = params;

  await startServer({ email, password, port });

  // Keep the task alive and periodically refresh the auth token
  while (BackgroundService.isRunning()) {
    await sleep(30 * 60 * 1000); // 30 minutes
    await refreshToken();
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
  if (BackgroundService.isRunning()) {
    return;
  }

  await BackgroundService.start(backgroundTask, {
    ...options,
    parameters: { email, password, port },
  });
}

export async function stopBackgroundService() {
  await stopServer();
  await BackgroundService.stop();
}

export function isBackgroundServiceRunning() {
  return BackgroundService.isRunning();
}
```

**Step 2: Commit**

```bash
cd C:/Users/user/lifeflow
git add mobile/src/background-service.js
git commit -m "feat: add background service for persistent HTTP server"
```

---

### Task 7: Login Screen

**Files:**
- Create: `mobile/src/screens/LoginScreen.js`
- Create: `mobile/src/auth.js`

**Step 1: Write the auth helper**

Create `mobile/src/auth.js`:
```js
import * as SecureStore from 'expo-secure-store';

const EMAIL_KEY = 'ln_email';
const PASSWORD_KEY = 'ln_password';

export async function saveCredentials(email, password) {
  await SecureStore.setItemAsync(EMAIL_KEY, email);
  await SecureStore.setItemAsync(PASSWORD_KEY, password);
}

export async function getCredentials() {
  const email = await SecureStore.getItemAsync(EMAIL_KEY);
  const password = await SecureStore.getItemAsync(PASSWORD_KEY);
  if (email && password) {
    return { email, password };
  }
  return null;
}

export async function clearCredentials() {
  await SecureStore.deleteItemAsync(EMAIL_KEY);
  await SecureStore.deleteItemAsync(PASSWORD_KEY);
}
```

**Step 2: Write the Login screen**

Create `mobile/src/screens/LoginScreen.js`:
```js
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { createLNClient } from '../ln-client.js';
import { saveCredentials } from '../auth.js';

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      // Validate credentials by attempting login
      const client = createLNClient({ email, password });
      await client.login();
      await saveCredentials(email, password);
      onLogin({ email, password });
    } catch (err) {
      Alert.alert('Login Failed', 'Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LifeFlow Bridge</Text>
      <Text style={styles.subtitle}>Sign in with your Life Network account</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#666"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#666"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign In</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 32,
  },
  input: {
    backgroundColor: '#16213e',
    color: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#6db3f2',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
```

**Step 3: Commit**

```bash
cd C:/Users/user/lifeflow
git add mobile/src/auth.js mobile/src/screens/LoginScreen.js
git commit -m "feat: add login screen with credential storage"
```

---

### Task 8: Podcasts Screen

**Files:**
- Create: `mobile/src/screens/PodcastsScreen.js`

Main screen showing all Life Network podcasts with subscribe buttons.

**Step 1: Write the Podcasts screen**

Create `mobile/src/screens/PodcastsScreen.js`:
```js
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { createLNClient } from '../ln-client.js';
import {
  startBackgroundService,
  stopBackgroundService,
  isBackgroundServiceRunning,
} from '../background-service.js';
import { clearCredentials } from '../auth.js';

const IMAGE_BASE = 'https://imagedelivery.net/0UfIQ3lQQ7vsurILwUoUag';
const PORT = 8080;

export default function PodcastsScreen({ credentials, onLogout }) {
  const [podcasts, setPodcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [serverRunning, setServerRunning] = useState(false);

  useEffect(() => {
    loadPodcasts();
    startService();
  }, []);

  async function loadPodcasts() {
    try {
      const client = createLNClient(credentials);
      await client.login();
      const items = await client.getPodcasts();
      setPodcasts(items);
    } catch (err) {
      Alert.alert('Error', 'Failed to load podcasts');
    } finally {
      setLoading(false);
    }
  }

  async function startService() {
    try {
      await startBackgroundService({ ...credentials, port: PORT });
      setServerRunning(true);
    } catch (err) {
      Alert.alert('Error', 'Failed to start background server');
    }
  }

  async function handleLogout() {
    await stopBackgroundService();
    await clearCredentials();
    onLogout();
  }

  function subscribePodcast(podcastId) {
    const feedUrl = `http://localhost:${PORT}/feed/${podcastId}`;
    // Try to open in Podcast Addict, fall back to clipboard
    Linking.openURL(`podcastaddict://subscribe/${encodeURIComponent(feedUrl)}`).catch(() => {
      // If Podcast Addict intent doesn't work, try generic RSS intent
      Linking.openURL(feedUrl).catch(() => {
        Alert.alert(
          'Feed URL',
          `Copy this URL and add it to your podcast app:\n\n${feedUrl}`,
        );
      });
    });
  }

  function renderPodcast({ item }) {
    const podcast = item.content;
    const imageUrl = podcast.heroImageId
      ? `${IMAGE_BASE}/${podcast.heroImageId}/public`
      : null;

    return (
      <View style={styles.podcastCard}>
        {imageUrl && <Image source={{ uri: imageUrl }} style={styles.artwork} />}
        <View style={styles.podcastInfo}>
          <Text style={styles.podcastTitle}>{podcast.title}</Text>
          <TouchableOpacity
            style={styles.subscribeButton}
            onPress={() => subscribePodcast(podcast.id)}
          >
            <Text style={styles.subscribeText}>Subscribe</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6db3f2" />
        <Text style={styles.loadingText}>Loading podcasts...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>LifeFlow Bridge</Text>
        <View style={styles.headerRight}>
          <View style={[styles.statusDot, serverRunning ? styles.statusOn : styles.statusOff]} />
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.subtitle}>
        Tap Subscribe to add a podcast to your player
      </Text>

      <FlatList
        data={podcasts}
        keyExtractor={(item) => item.content.id}
        renderItem={renderPodcast}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 48,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusOn: {
    backgroundColor: '#4caf50',
  },
  statusOff: {
    backgroundColor: '#f44336',
  },
  logoutText: {
    color: '#6db3f2',
    fontSize: 14,
  },
  list: {
    padding: 16,
  },
  podcastCard: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  artwork: {
    width: 80,
    height: 80,
  },
  podcastInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  podcastTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  subscribeButton: {
    backgroundColor: '#6db3f2',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  subscribeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
```

**Step 2: Commit**

```bash
cd C:/Users/user/lifeflow
git add mobile/src/screens/PodcastsScreen.js
git commit -m "feat: add podcasts screen with subscribe buttons"
```

---

### Task 9: App Entry Point

**Files:**
- Modify: `mobile/App.js`

Wire up the Login and Podcasts screens with simple state management.

**Step 1: Write App.js**

Replace `mobile/App.js`:
```js
import { useState, useEffect } from 'react';
import { StatusBar } from 'react-native';
import LoginScreen from './src/screens/LoginScreen.js';
import PodcastsScreen from './src/screens/PodcastsScreen.js';
import { getCredentials } from './src/auth.js';

export default function App() {
  const [credentials, setCredentials] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkExistingCredentials();
  }, []);

  async function checkExistingCredentials() {
    const saved = await getCredentials();
    if (saved) {
      setCredentials(saved);
    }
    setLoading(false);
  }

  if (loading) return null;

  if (!credentials) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
        <LoginScreen onLogin={setCredentials} />
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <PodcastsScreen
        credentials={credentials}
        onLogout={() => setCredentials(null)}
      />
    </>
  );
}
```

**Step 2: Commit**

```bash
cd C:/Users/user/lifeflow
git add mobile/App.js
git commit -m "feat: wire up app with login/podcasts flow"
```

---

### Task 10: Android Configuration

**Files:**
- Modify: `mobile/app.json`

Configure Android-specific settings: cleartext traffic (for localhost HTTP), foreground service permissions, and background actions.

**Step 1: Update app.json with Android config plugin for cleartext**

Create `mobile/plugins/withCleartextTraffic.js`:
```js
const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, async (config) => {
    const application = config.modResults.manifest.application[0];
    application.$['android:usesCleartextTraffic'] = 'true';
    return config;
  });
};
```

**Step 2: Update app.json to use plugin**

Add to `mobile/app.json` plugins array:
```json
{
  "plugins": [
    "expo-secure-store",
    "./plugins/withCleartextTraffic"
  ]
}
```

**Step 3: Commit**

```bash
cd C:/Users/user/lifeflow
git add mobile/plugins/ mobile/app.json
git commit -m "feat: configure Android cleartext traffic for localhost HTTP"
```

---

### Task 11: Build and Test on Device

**Step 1: Generate Android project and build dev client**

```bash
cd mobile
npx expo prebuild --platform android
npx expo run:android
```

**Step 2: Test on device/emulator**

1. App opens → Login screen appears
2. Enter Life Network credentials → tap Sign In
3. Podcasts list loads with artwork
4. Foreground notification appears ("LifeFlow Bridge - Serving podcast feeds on localhost")
5. Tap "Subscribe" on a podcast
6. Podcast Addict (or browser) opens with the feed URL
7. In Podcast Addict, verify the RSS feed loads with episodes
8. Play an episode — audio should stream correctly

**Step 3: Final commit**

```bash
cd C:/Users/user/lifeflow
git add -A
git commit -m "feat: LifeFlow Bridge mobile app v1.0"
```

---

## Summary

| Task | What it builds | Key files |
|---|---|---|
| 1 | Expo project scaffolding | `mobile/package.json`, `mobile/app.json` |
| 2 | Port pure JS modules | `mobile/src/ln-client.js`, `mobile/src/show-notes.js`, `mobile/src/feed.js` |
| 3 | HTTP server native module | `mobile/modules/http-server/` (Kotlin + JS bridge) |
| 4 | Request handler | `mobile/src/request-handler.js` |
| 5 | Server bridge | `mobile/src/server.js` |
| 6 | Background service | `mobile/src/background-service.js` |
| 7 | Login screen + auth | `mobile/src/screens/LoginScreen.js`, `mobile/src/auth.js` |
| 8 | Podcasts screen | `mobile/src/screens/PodcastsScreen.js` |
| 9 | App entry point | `mobile/App.js` |
| 10 | Android config | `mobile/plugins/withCleartextTraffic.js` |
| 11 | Build + test on device | Integration testing |
