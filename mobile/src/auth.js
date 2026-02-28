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
