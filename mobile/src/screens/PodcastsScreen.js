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
import { clearCredentials } from '../auth.js';

const IMAGE_BASE = 'https://imagedelivery.net/0UfIQ3lQQ7vsurILwUoUag';
const PORT = 8080;

export default function PodcastsScreen({ credentials, onLogout }) {
  const [podcasts, setPodcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [serverRunning, setServerRunning] = useState(false);
  const [serverError, setServerError] = useState(null);

  useEffect(() => {
    loadPodcasts();
  }, []);

  async function loadPodcasts() {
    try {
      const client = createLNClient(credentials);
      await client.login();
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
        const { stopBackgroundService } = await import('../background-service.js');
        await stopBackgroundService();
        setServerRunning(false);
        setServerError(null);
      } catch (err) {
        Alert.alert('Error', 'Failed to stop server: ' + err.message);
      }
    } else {
      try {
        setServerError(null);
        const { startBackgroundService } = await import('../background-service.js');
        await startBackgroundService({ ...credentials, port: PORT });
        setServerRunning(true);
      } catch (err) {
        setServerError(err.message);
        Alert.alert('Server Error', 'Failed to start server: ' + err.message);
      }
    }
  }

  async function handleLogout() {
    try {
      const { stopBackgroundService } = await import('../background-service.js');
      await stopBackgroundService();
    } catch {}
    await clearCredentials();
    onLogout();
  }

  function subscribePodcast(podcastId) {
    const feedUrl = `http://localhost:${PORT}/feed/${podcastId}`;
    Linking.openURL(`podcastaddict://subscribe/${encodeURIComponent(feedUrl)}`).catch(() => {
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
    marginBottom: 12,
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
