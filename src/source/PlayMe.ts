import * as cheerio from 'cheerio';
import levenshtein from 'fast-levenshtein';
import memoize from 'memoizee';
import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode } from '../types';
import { Fetcher, getTmdbNameAndYear, Id, TmdbId } from '../utils';
import { Source, SourceResult } from './Source';

export class PlayMe extends Source {
  public readonly id = 'playme';
  public readonly label = 'PlayMe';
  public readonly contentTypes: ContentType[] = ['movie'];
  public readonly countryCodes: CountryCode[] = [CountryCode.multi];
  public readonly baseUrl = 'https://playme.wtf/filmy/';

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();
    this.fetcher = fetcher;

    // Memoize async function correctly
    this.getBaseUrl = memoize(this.getBaseUrl, {
      maxAge: 3600000,
      normalizer: () => 'baseUrl',
      promise: true,
    });
  }

  public async handleInternal(
    ctx: Context,
    _type: string,
    id: Id
  ): Promise<SourceResult[]> {
    if (id.season) return [];

    const tmdbId = new TmdbId(Number(id.id), undefined, undefined);

    const [name, rawYear] = await getTmdbNameAndYear(ctx, this.fetcher, tmdbId);
    const year = Number(rawYear);

    const pageUrl = await this.fetchPageUrl(ctx, name, year);
    if (!pageUrl) return [];

    // Force Czech-dubbed player
    pageUrl.searchParams.set('p', '1');

    const html = await this.fetcher.text(ctx, pageUrl);
    const $ = cheerio.load(html);

    const results: SourceResult[] = [];

    // Extract iframe embeds
    $('iframe').each((_i, el) => {
      const src = $(el).attr('src');
      if (!src) return;

      try {
        const url = new URL(src);
        results.push({
          url,
          meta: {
            countryCodes: [CountryCode.multi],
            title: name,
          },
        });
      } catch {
        /* ignore invalid URLs */
      }
    });

    // Extract direct video links
    $('a[href*=".mp4"], a[href*=".m3u8"]').each((_i, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      try {
        const url = new URL(href, pageUrl);
        results.push({
          url,
          meta: {
            countryCodes: [CountryCode.multi],
            title: name,
          },
        });
      } catch {
        /* ignore invalid URLs */
      }
    });

    return results;
  }

  private readonly fetchPageUrl = async (
    ctx: Context,
    name: string,
    year: number
  ): Promise<URL | undefined> => {
    const base = await this.getBaseUrl(ctx);

    // Construct direct URL
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const directUrl = new URL(`/filmy/${encodeURIComponent(slug)}-${year}-online-cz-sk`, base);

    // Try direct URL first
    try {
      await this.fetcher.head(ctx, directUrl);
      return directUrl;
    } catch {
      // Fallback to search
      const searchUrl = new URL(`/?s=${encodeURIComponent(name)}`, base);
      const html = await this.fetcher.text(ctx, searchUrl);
      const $ = cheerio.load(html);

      let bestMatch: { url: URL; score: number } | undefined;

      $('.movie-item, .film-item, .item').each((_i, el) => {
        const title = $('.title, .name, h2, h3', el).text().trim();
        if (!title) return;

        const yearMatch = $('.year, .date', el).text().match(/\d{4}/);
        const itemYear = yearMatch ? Number(yearMatch[0]) : null;

        const diff = levenshtein.get(title.toLowerCase(), name.toLowerCase());
        const yearDiff = itemYear !== null ? Math.abs(itemYear - year) : Infinity;

        const score =
          diff +
          (yearDiff < 2 ? 0 : yearDiff > 5 ? 100 : yearDiff * 10);

        if (!bestMatch || score < bestMatch.score) {
          const href = $(el).attr('href') || $('a', el).attr('href');
          if (!href) return;

          try {
            const url = new URL(href, base);
            bestMatch = { url, score };
          } catch {
            /* ignore invalid URLs */
          }
        }
      });

      return bestMatch?.url;
    }
  };

  private readonly getBaseUrl = async (ctx: Context): Promise<URL> => {
    return await this.fetcher.getFinalRedirectUrl(ctx, new URL(this.baseUrl));
  };
}
