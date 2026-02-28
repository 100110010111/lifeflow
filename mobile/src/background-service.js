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
