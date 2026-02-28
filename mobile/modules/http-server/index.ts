import { requireNativeModule, EventEmitter, Subscription } from 'expo-modules-core';

let _module: any = null;
let _emitter: any = null;

function getModule() {
  if (!_module) {
    _module = requireNativeModule('HttpServer');
  }
  return _module;
}

function getEmitter() {
  if (!_emitter) {
    _emitter = new EventEmitter(getModule());
  }
  return _emitter;
}

export type RequestEvent = {
  requestId: string;
  uri: string;
  method: string;
  query: string;
};

export async function start(port: number): Promise<boolean> {
  return getModule().start(port);
}

export async function stop(): Promise<boolean> {
  return getModule().stop();
}

export function respond(
  requestId: string,
  statusCode: number,
  contentType: string,
  body: string,
  locationHeader?: string
): void {
  getModule().respond(requestId, statusCode, contentType, body, locationHeader ?? null);
}

export function isRunning(): boolean {
  return getModule().isRunning();
}

export function addRequestListener(
  listener: (event: RequestEvent) => void
): Subscription {
  return getEmitter().addListener('onRequest', listener);
}
