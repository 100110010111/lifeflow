import { requireNativeModule } from 'expo-modules-core';

let _module: any = null;

function getModule() {
  if (!_module) {
    _module = requireNativeModule('HttpServer');
  }
  return _module;
}

export async function start(port: number): Promise<boolean> {
  return getModule().start(port);
}

export async function stop(): Promise<boolean> {
  return getModule().stop();
}

export function setFeed(podcastId: string, xml: string): void {
  getModule().setFeed(podcastId, xml);
}

export function setAudioUrl(mediaId: string, url: string): void {
  getModule().setAudioUrl(mediaId, url);
}

export function clearFeeds(): void {
  getModule().clearFeeds();
}

export function clearAudioUrls(): void {
  getModule().clearAudioUrls();
}

export function isRunning(): boolean {
  return getModule().isRunning();
}

export function diagnostics(): string {
  return getModule().diagnostics();
}

export function isIgnoringBatteryOptimizations(): boolean {
  return getModule().isIgnoringBatteryOptimizations();
}

export function requestBatteryOptimizationExemption(): boolean {
  return getModule().requestBatteryOptimizationExemption();
}
