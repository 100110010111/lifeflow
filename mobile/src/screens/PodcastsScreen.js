import { useState, useEffect, useRef } from 'react';
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
import * as Clipboard from 'expo-clipboard';
import { createLNClient } from '../ln-client.js';
import { generateFeed } from '../feed.js';
import { parseShowNotes } from '../show-notes.js';
import { clearCredentials } from '../auth.js';

const IMAGE_BASE = 'https://imagedelivery.net/0UfIQ3lQQ7vsurILwUoUag';
const PORT = 8080;

export default function PodcastsScreen({ credentials, onLogout }) {
  const [podcasts, setPodcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [serverRunning, setServerRunning] = useState(false);
  const [serverStatus, setServerStatus] = useState('');
  const [serverError, setServerError] = useState(null);
  const clientRef = useRef(null);

  useEffect(() => {
    loadPodcasts();
  }, []);

  async function loadPodcasts() {
    try {
      const client = createLNClient(credentials);
      await client.login();
      clientRef.current = client;
      const items = await client.getPodcasts();
      setPodcasts(items);
    } catch (err) {
      Alert.alert('Error', 'Failed to load podcasts: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleServer() {
    if (serverRunning) {
      try {
        setServerStatus('Stopping...');
        const HttpServer = await import('../../modules/http-server');
        await HttpServer.stop();
        setServerRunning(false);
        setServerStatus('');
        setServerError(null);
      } catch (err) {
        setServerError('Stop failed: ' + (err.message || String(err)));
      }
      return;
    }

    setServerError(null);
    const client = clientRef.current;

    if (!client) {
      setServerError('Not authenticated. Try logging out and back in.');
      return;
    }

    try {
      const HttpServer = await import('../../modules/http-server');

      // Step 1: Start the HTTP server
      setServerStatus('Starting HTTP server...');
      await HttpServer.start(PORT);

      // Step 2: Generate feeds for each podcast
      let feedCount = 0;
      let audioCount = 0;

      for (const item of podcasts) {
        const podcast = item.content;
        setServerStatus(`Generating feed: ${podcast.title}...`);

        try {
          const [podcastData, episodeList] = await Promise.all([
            client.getPodcast(podcast.id),
            client.getEpisodes(podcast.id),
          ]);

          // Fetch episode details in parallel (batched)
          const episodeDetails = await Promise.all(
            episodeList.map(ep =>
              client.getEpisodeDetail(podcast.id, ep.content.id).catch(() => null)
            )
          );

          // Resolve author name
          let authorName = 'Life Network';
          try {
            const contributor = await client.getContributor(podcastData.metadata.authorProfileId);
            if (contributor?.profile?.userProfile) {
              const p = contributor.profile.userProfile;
              authorName = `${p.firstName || ''} ${p.lastName || ''}`.trim() || authorName;
            }
          } catch {}

          // Build episodes array and collect audio URLs
          const episodes = episodeList.map((ep, i) => {
            const detail = episodeDetails[i];
            const audioMediaId = detail?.body?.audioMediaId || null;

            // Pre-register audio URL if available
            if (audioMediaId) {
              // We'll fetch audio URLs lazily when needed, but register the ID
              audioCount++;
            }

            return {
              id: ep.content.id,
              title: ep.content.title,
              publishedAt: ep.content.publishedAt,
              description: detail ? parseShowNotes(detail.body?.showNotes) : '',
              audioMediaId,
              heroImageId: ep.content.heroImageId,
            };
          });

          // Generate RSS XML
          const feedPodcast = {
            id: podcast.id,
            title: podcastData.metadata.title,
            authorName,
            heroImageId: podcastData.metadata.heroImageId,
            publishedAt: podcastData.metadata.publishedAt,
          };

          const xml = generateFeed({
            podcast: feedPodcast,
            episodes,
            baseUrl: `http://localhost:${PORT}`,
          });

          // Push feed to native module
          HttpServer.setFeed(podcast.id, xml);
          feedCount++;

          // Pre-fetch audio URLs for this podcast's episodes
          setServerStatus(`Fetching audio URLs for ${podcast.title}...`);
          const audioPromises = episodes
            .filter(ep => ep.audioMediaId)
            .map(async (ep) => {
              try {
                const signedUrl = await client.getAudioUrl(ep.audioMediaId);
                HttpServer.setAudioUrl(ep.audioMediaId, signedUrl);
              } catch {}
            });
          await Promise.all(audioPromises);

        } catch (err) {
          // Skip this podcast on error, continue with others
          console.warn(`Failed to generate feed for ${podcast.title}:`, err);
        }
      }

      setServerRunning(true);
      setServerStatus(`Serving ${feedCount} feeds on localhost:${PORT}`);
    } catch (err) {
      setServerError(err.message || String(err));
      setServerStatus('');
      // Try to stop server if it was started
      try {
        const HttpServer = await import('../../modules/http-server');
        await HttpServer.stop();
      } catch {}
    }
  }

  async function handleLogout() {
    try {
      if (serverRunning) {
        const HttpServer = await import('../../modules/http-server');
        await HttpServer.stop();
      }
    } catch {}
    await clearCredentials();
    onLogout();
  }

  function subscribePodcast(podcastId) {
    if (!serverRunning) {
      Alert.alert('Server Not Running', 'Start the feed server first, then subscribe.');
      return;
    }

    const feedUrl = `http://localhost:${PORT}/feed/${podcastId}`;

    // Use pcast:// scheme — widely supported by podcast apps
    const pcastUrl = `pcast://localhost:${PORT}/feed/${podcastId}`;

    Linking.openURL(pcastUrl).catch(() => {
      // Fallback: copy to clipboard and instruct user
      Clipboard.setStringAsync(feedUrl);
      Alert.alert(
        'Feed URL Copied',
        'The feed URL has been copied to your clipboard.\n\nOpen your podcast app, tap + then RSS Feed, and paste:\n\n' + feedUrl,
      );
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
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.serverButton, serverRunning ? styles.serverButtonOn : styles.serverButtonOff]}
        onPress={toggleServer}
      >
        <View style={[styles.statusDot, serverRunning ? styles.statusOn : styles.statusOff]} />
        <Text style={styles.serverButtonText}>
          {serverRunning ? 'Server Running — Tap to Stop' : 'Start Feed Server'}
        </Text>
      </TouchableOpacity>

      {serverStatus !== '' && (
        <Text style={serverError ? styles.errorText : styles.statusText}>{serverStatus}</Text>
      )}

      {serverError && (
        <Text style={styles.errorText}>{serverError}</Text>
      )}

      <Text style={styles.subtitle}>
        {serverRunning
          ? 'Tap Subscribe to add a podcast to your player'
          : 'Start the server first, then subscribe to podcasts'}
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
  serverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 8,
    gap: 10,
  },
  serverButtonOff: {
    backgroundColor: '#16213e',
  },
  serverButtonOn: {
    backgroundColor: '#1b3a1b',
  },
  serverButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
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
  statusText: {
    color: '#6db3f2',
    fontSize: 12,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  errorText: {
    color: '#f44336',
    fontSize: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
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
