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
import { clearCredentials } from '../auth.js';

const PORT = 8080;

export default function PodcastsScreen({ credentials, onLogout }) {
  const [podcasts, setPodcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [serverRunning, setServerRunning] = useState(false);
  const [serverStatus, setServerStatus] = useState('');
  const [serverError, setServerError] = useState(null);
  const startedRef = useRef(false);

  useEffect(() => {
    loadAndStart();
    return () => {
      // Don't stop on unmount — background service keeps running
    };
  }, []);

  async function loadAndStart() {
    try {
      const client = createLNClient(credentials);
      await client.login();
      const items = await client.getPodcasts();
      setPodcasts(items);
      setLoading(false);

      // Auto-start server if not already running
      if (!startedRef.current) {
        startedRef.current = true;
        await startServer();
      }
    } catch (err) {
      setLoading(false);
      Alert.alert('Error', 'Failed to load podcasts: ' + err.message);
    }
  }

  async function startServer() {
    setServerError(null);
    setServerStatus('Starting feed server...');

    try {
      const { startBackgroundService, isBackgroundServiceRunning } = await import('../background-service.js');

      if (isBackgroundServiceRunning()) {
        setServerRunning(true);
        setServerStatus('Server running');
        return;
      }

      await startBackgroundService({ ...credentials, port: PORT });
      setServerRunning(true);
      setServerStatus('Server running');
    } catch (err) {
      // Fallback: try direct server start without background service
      try {
        setServerStatus('Starting server (foreground)...');
        const HttpServer = await import('../../modules/http-server');
        const { generateFeed } = await import('../feed.js');
        const { parseShowNotes } = await import('../show-notes.js');

        await HttpServer.start(PORT);

        const client = createLNClient(credentials);
        await client.login();
        const items = await client.getPodcasts();

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
              baseUrl: `http://localhost:${PORT}`,
            });
            HttpServer.setFeed(podcast.id, xml);
            await Promise.all(
              episodes.filter(ep => ep.audioMediaId).map(async (ep) => {
                try {
                  const signedUrl = await client.getAudioUrl(ep.audioMediaId);
                  HttpServer.setAudioUrl(ep.audioMediaId, signedUrl);
                } catch {}
              })
            );
          } catch {}
        }
        setServerRunning(true);
        setServerStatus('Server running (foreground only)');
      } catch (fallbackErr) {
        setServerError(fallbackErr.message || String(fallbackErr));
        setServerStatus('');
      }
    }
  }

  async function handleLogout() {
    try {
      const { stopBackgroundService } = await import('../background-service.js');
      await stopBackgroundService();
    } catch {}
    try {
      const HttpServer = await import('../../modules/http-server');
      await HttpServer.stop();
    } catch {}
    await clearCredentials();
    onLogout();
  }

  function subscribePodcast(podcastId) {
    if (!serverRunning) {
      Alert.alert('Server Not Running', 'The feed server is still starting. Please wait a moment.');
      return;
    }

    const feedUrl = `http://localhost:${PORT}/feed/${podcastId}`;
    const pcastUrl = `pcast://localhost:${PORT}/feed/${podcastId}`;

    Linking.openURL(pcastUrl).catch(() => {
      Clipboard.setStringAsync(feedUrl);
      Alert.alert(
        'Feed URL Copied',
        'The feed URL has been copied to your clipboard.\n\nOpen your podcast app, tap + then RSS Feed, and paste:\n\n' + feedUrl,
      );
    });
  }

  function renderPodcast({ item }) {
    const podcast = item.content;
    const imageUrl = item.renderURL || null;

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

      {serverStatus !== '' && !serverError && (
        <Text style={styles.statusText}>{serverStatus}</Text>
      )}
      {serverError && (
        <Text style={styles.errorText}>{serverError}</Text>
      )}

      <Text style={styles.subtitle}>
        {serverRunning
          ? 'Tap Subscribe to add a podcast to your player'
          : 'Starting feed server...'}
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
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  loadingContainer: { flex: 1, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#888', marginTop: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 48 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 13, color: '#888', paddingHorizontal: 16, marginBottom: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusOn: { backgroundColor: '#4caf50' },
  statusOff: { backgroundColor: '#f44336' },
  statusText: { color: '#6db3f2', fontSize: 12, paddingHorizontal: 16, marginBottom: 4 },
  errorText: { color: '#f44336', fontSize: 12, paddingHorizontal: 16, marginBottom: 8 },
  logoutText: { color: '#6db3f2', fontSize: 14 },
  list: { padding: 16 },
  podcastCard: { flexDirection: 'row', backgroundColor: '#16213e', borderRadius: 8, marginBottom: 12, overflow: 'hidden' },
  artwork: { width: 80, height: 80 },
  podcastInfo: { flex: 1, padding: 12, justifyContent: 'space-between' },
  podcastTitle: { color: '#fff', fontSize: 15, fontWeight: '500' },
  subscribeButton: { backgroundColor: '#6db3f2', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 4, alignSelf: 'flex-start' },
  subscribeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
