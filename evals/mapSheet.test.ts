import { assertEquals } from 'jsr:@std/assert@1';

import { checkEntry, type Labels, readSheet, type SheetClip, sheetSection } from './mapSheet.ts';

const clip: SheetClip = {
  code: 'c03',
  round: 'main',
  category: 'everyday',
  seconds: 62,
  timerStopped: false,
  question: 'What do you like?',
  sentences: ['Um, so.', 'I like cats.', 'They are calm.'],
};

const entry = (changes: Partial<ReturnType<typeof readSheet>[number]> = {}) => ({
  code: 'c03',
  question: 'What do you like?',
  point: '2',
  restarts: '',
  labels: ['off_track', 'point', 'support'],
  ...changes,
});

Deno.test('a new clip on the sheet shows its numbered sentences with nothing filled in', () => {
  assertEquals(
    sheetSection(clip),
    ['## c03', '', 'main · everyday · 1:02', 'question: What do you like?', 'point: ', 'restarts: ', '', '1.  | Um, so.', '2.  | I like cats.', '3.  | They are calm.', ''].join('\n'),
  );
});

Deno.test('what the owner types is read back, and a saved clip comes back the same', () => {
  const saved: Labels = { question: 'What pets do you like?', sentences: 3, labels: ['off_track', 'point', 'support'], point: 2, restarts: [1] };
  const [read] = readSheet(`# intro\n\n${sheetSection({ ...clip, timerStopped: true }, saved)}`);
  assertEquals(read, { code: 'c03', question: 'What pets do you like?', point: '2', restarts: '1', labels: ['off_track', 'point', 'support'] });
  assertEquals(checkEntry(read, 3), { labels: saved });
});

Deno.test('a sentence with a "|" in its words keeps the label before the first one', () => {
  assertEquals(readSheet('## c01\n1. support | A | B\n')[0].labels, ['support']);
});

Deno.test('a clip with an empty label or no point yet is still to do', () => {
  assertEquals(checkEntry(entry({ labels: ['off_track', '', 'support'] }), 3), { todo: true });
  assertEquals(checkEntry(entry({ labels: ['off_track', 'point'] }), 3), { todo: true });
  assertEquals(checkEntry(entry({ point: '' }), 3), { todo: true });
});

Deno.test('labels are forgiving about case and spaces, and strict about the five words', () => {
  const ok = checkEntry(entry({ labels: ['Off track', 'POINT', 'support'] }), 3);
  assertEquals('labels' in ok && ok.labels.labels, ['off_track', 'point', 'support']);
  assertEquals(checkEntry(entry({ labels: ['aside', 'point', 'support'] }), 3), { problems: ['sentence 1: "aside" is not one of direction, point, support, off_track, ending'] });
});

Deno.test('the point rules: one run of point sentences, and the point sentence is one of them', () => {
  assertEquals(checkEntry(entry({ labels: ['point', 'support', 'point'], point: '1' }), 3), { problems: ['point sentences must be one run: exactly one step is point'] });
  assertEquals(checkEntry(entry({ point: '3' }), 3), { problems: ['point is sentence 3, but that sentence is not labelled point'] });
  assertEquals(checkEntry(entry({ point: '9' }), 3), { problems: ['point "9" is not a sentence number or "none"'] });
  assertEquals(checkEntry(entry({ point: 'none' }), 3), { problems: ['point is "none", but some sentences are labelled point'] });
  const none = checkEntry(entry({ point: 'None', labels: ['off_track', 'support', 'support'] }), 3);
  assertEquals('labels' in none && none.labels.point, null);
});

Deno.test('restarts are sentence numbers', () => {
  const ok = checkEntry(entry({ restarts: '1, 3' }), 3);
  assertEquals('labels' in ok && ok.labels.restarts, [1, 3]);
  assertEquals(checkEntry(entry({ restarts: '4' }), 3), { problems: ['restarts "4" must be sentence numbers separated by commas'] });
});
