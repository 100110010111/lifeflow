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
