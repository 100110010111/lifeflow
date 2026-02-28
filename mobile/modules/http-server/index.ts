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
