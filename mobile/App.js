import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import LoginScreen from './src/screens/LoginScreen.js';
import PodcastsScreen from './src/screens/PodcastsScreen.js';
import { getCredentials, clearCredentials } from './src/auth.js';

class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  async handleReset() {
    await clearCredentials();
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) this.props.onReset();
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={crashStyles.container}>
          <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
          <Text style={crashStyles.title}>Something went wrong</Text>
          <Text style={crashStyles.error}>{this.state.error?.message || 'Unknown error'}</Text>
          <TouchableOpacity style={crashStyles.button} onPress={() => this.handleReset()}>
            <Text style={crashStyles.buttonText}>Clear Data & Restart</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const crashStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e', justifyContent: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 12 },
  error: { fontSize: 13, color: '#f44336', textAlign: 'center', marginBottom: 24 },
  button: { backgroundColor: '#6db3f2', padding: 16, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default function App() {
  const [credentials, setCredentials] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkExistingCredentials();
  }, []);

  async function checkExistingCredentials() {
    try {
      const saved = await getCredentials();
      if (saved) {
        setCredentials(saved);
      }
    } catch {}
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
    <ErrorBoundary onReset={() => setCredentials(null)}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <PodcastsScreen
        credentials={credentials}
        onLogout={() => setCredentials(null)}
      />
    </ErrorBoundary>
  );
}
