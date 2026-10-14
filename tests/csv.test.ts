import { describe, expect, it } from 'vitest';
import { toCsv } from '../src/lib/csv';

describe('toCsv', () => {
  it('quotes commas, quotes, and newlines', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['line\nbreak', 3]])).toBe('a,b\r\n"x,y","say ""hi"""\r\n"line\nbreak",3');
  });
  it('neutralizes spreadsheet formulas', () => {
    expect(toCsv(['n'], [['=HYPERLINK("x")'], ['+1'], ['@cmd']])).toBe(`n\r\n"'=HYPERLINK(""x"")"\r\n'+1\r\n'@cmd`);
  });
  it('renders empty values', () => {
    expect(toCsv(['a'], [[null], [undefined]])).toBe('a\r\n\r\n');
  });
});
