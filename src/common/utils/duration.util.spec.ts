import { asJwtDuration, parseDurationToMs } from './duration.util';

describe('parseDurationToMs', () => {
  it.each([
    ['15m', 15 * 60_000],
    ['30d', 30 * 86_400_000],
    ['1h', 3_600_000],
    ['500ms', 500],
    ['10s', 10_000],
  ])('parses "%s" as %i ms', (input, expected) => {
    expect(parseDurationToMs(input)).toBe(expected);
  });

  it.each(['', '15', 'm', '15 m', '15minutes', '-15m'])(
    'rejects invalid format "%s"',
    (input) => {
      expect(() => parseDurationToMs(input)).toThrow();
    },
  );
});

describe('asJwtDuration', () => {
  it('passes through a valid duration unchanged', () => {
    expect(asJwtDuration('15m')).toBe('15m');
  });

  it('throws on an invalid duration instead of silently signing a bad token', () => {
    expect(() => asJwtDuration('not-a-duration')).toThrow();
  });
});
