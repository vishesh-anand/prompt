// Typographic quotes and apostrophes for text on screen (DESIGN.md, Lettering): coach text and the speaker's quoted
// words come in with straight ' and ", and are shown with ‘ ’ “ ”. One formatter at display time, not a prompt change.
const opensAfter = /[\s([{“‘—–-]/;

export function curly(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const before = text[i - 1] ?? ' ';
    const opening = opensAfter.test(before);
    if (char === '"') out += opening ? '“' : '”';
    else if (char === "'") out += opening ? '‘' : '’';
    else out += char;
  }
  return out;
}
