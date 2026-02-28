import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from './app.js';

describe('createApp', () => {
  it('returns an express app', () => {
    const app = createApp({ lnClient: {} });
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe('function');
  });
});
