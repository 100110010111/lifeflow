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
