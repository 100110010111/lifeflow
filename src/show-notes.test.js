import { describe, it, expect } from 'vitest';
import { parseShowNotes } from './show-notes.js';

describe('parseShowNotes', () => {
  it('extracts plain text from rich text nodes', () => {
    const notes = JSON.stringify([
      { type: 'p', children: [{ text: 'First paragraph.' }], id: 'a' },
      { type: 'p', children: [{ text: 'Second paragraph.' }], id: 'b' },
    ]);
    expect(parseShowNotes(notes)).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('handles empty/null input', () => {
    expect(parseShowNotes(null)).toBe('');
    expect(parseShowNotes('')).toBe('');
    expect(parseShowNotes('[]')).toBe('');
  });

  it('handles nodes with multiple children', () => {
    const notes = JSON.stringify([
      { type: 'p', children: [{ text: 'Hello ' }, { text: 'world' }], id: 'a' },
    ]);
    expect(parseShowNotes(notes)).toBe('Hello world');
  });

  it('skips empty paragraphs', () => {
    const notes = JSON.stringify([
      { type: 'p', children: [{ text: 'Content' }], id: 'a' },
      { type: 'p', children: [{ text: '\n' }], id: 'b' },
      { type: 'p', children: [{ text: 'More content' }], id: 'c' },
    ]);
    expect(parseShowNotes(notes)).toBe('Content\n\nMore content');
  });
});
