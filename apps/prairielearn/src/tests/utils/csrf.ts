import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { assert } from 'vitest';

export async function getCsrfToken(url: string) {
  const res = await fetch(url);
  assert.isOk(res.ok);
  const $ = cheerio.load(await res.text());
  return $('span[id=test_csrf_token]').text();
}
