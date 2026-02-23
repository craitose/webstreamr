import { createTestContext } from '../test';
import { FetcherMock, TmdbId } from '../utils';
import { PlayMe } from './PlayMe';

const ctx = createTestContext();

describe('PlayMe', () => {
  let source: PlayMe;

  beforeEach(() => {
    source = new PlayMe(new FetcherMock(`${__dirname}/__fixtures__/PlayMe`));
  });

  test('handle cleaner 2025', async () => {
    const streams = await source.handle(ctx, 'movie', new TmdbId(1125899, undefined, undefined));
    expect(streams).toMatchSnapshot();
  });

  test('handle non-existent movie gracefully', async () => {
    const streams = await source.handle(ctx, 'movie', new TmdbId(999999999, undefined, undefined));
    expect(streams).toMatchSnapshot();
  });

  test('handle series request returns empty (not supported)', async () => {
    const streams = await source.handle(ctx, 'series', new TmdbId(1125899, 1, 1));
    expect(streams).toEqual([]);
  });
});