import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';

import * as async from 'async';
import * as cheerio from 'cheerio';
import mime from 'mime';
import { chromium } from 'playwright';

import { APP_ROOT_PATH } from '../../../lib/paths.js';

const require = createRequire(import.meta.url);
const origin = 'https://ai-grading.invalid';

const captureQueue = async.queue(async (html: string) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 2 });
    const assets = new Map([
      ['/jquery.js', require.resolve('jquery/dist/jquery.js')],
      ['/fabric.js', require.resolve('fabric/dist/fabric.js')],
      ['/lodash.js', require.resolve('lodash/lodash.js')],
      ['/sylvester.js', path.join(APP_ROOT_PATH, 'public/javascripts/sylvester.js')],
      ['/pl-drawing.js', path.join(APP_ROOT_PATH, 'elements/pl-drawing/pl-drawing.js')],
      ['/mechanicsObjects.js', path.join(APP_ROOT_PATH, 'elements/pl-drawing/mechanicsObjects.js')],
      ['/pl-drawing.css', path.join(APP_ROOT_PATH, 'elements/pl-drawing/pl-drawing.css')],
    ]);
    const packageAssets = new Map([
      ['/mathjax/', path.dirname(require.resolve('mathjax/package.json'))],
      [
        '/mathjax-fonts/',
        path.dirname(require.resolve('@mathjax/mathjax-newcm-font/package.json')),
      ],
    ]);
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        await route.abort();
        return;
      }
      if (url.pathname === '/') {
        await route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><html><body></body></html>',
        });
        return;
      }
      let filename = assets.get(url.pathname);
      for (const [prefix, directory] of packageAssets) {
        if (!url.pathname.startsWith(prefix)) continue;
        const resolved = path.resolve(
          directory,
          decodeURIComponent(url.pathname.slice(prefix.length)),
        );
        if (resolved.startsWith(`${directory}${path.sep}`)) filename = resolved;
      }
      if (!filename) {
        await route.abort();
        return;
      }
      await route.fulfill({
        body: await readFile(filename),
        contentType: mime.getType(filename) ?? 'application/octet-stream',
      });
    });
    await page.goto(origin);
    await page.addScriptTag({
      content: `window.MathJax = {
        startup: { typeset: false },
        svg: { linebreaks: { inline: false } },
        loader: { paths: { 'mathjax-newcm': '${origin}/mathjax-fonts' } }
      };`,
    });
    for (const script of [
      '/jquery.js',
      '/fabric.js',
      '/lodash.js',
      '/sylvester.js',
      '/mathjax/tex-svg.js',
      '/pl-drawing.js',
      '/mechanicsObjects.js',
    ]) {
      await page.addScriptTag({ url: `${origin}${script}` });
    }
    await page.addStyleTag({ url: `${origin}/pl-drawing.css` });
    // Browser callbacks must not depend on helpers injected by the TypeScript transpiler.
    await page.addScriptTag({
      content: `(() => {
        PLDrawingApi.aiGradingDrawingsReady = function() {
          const ready = (objects) => objects.every((object) => {
            if (object.type === 'latex-text' && object.label?.trim() && !object.image) return false;
            return !object.getObjects || ready(object.getObjects());
          });
          return [...document.querySelectorAll('.pl-drawing-container')].every((drawing) => {
            const canvas = drawing.aiGradingCanvas;
            if (!drawing.dataset.aiGradingDrawingInitialized || !canvas || !ready(canvas.getObjects())) {
              return false;
            }
            canvas.renderAll();
            return true;
          });
        };
        const setup = PLDrawingApi.setupCanvas;
        const create = PLDrawingApi.createElement;
        PLDrawingApi.createElement = function(canvas, options, answer) {
          if (!(options.type in this.elements)) {
            throw new Error('AI grading cannot capture drawing extension: ' + options.type);
          }
          return create.call(this, canvas, options, answer);
        };
        PLDrawingApi.setupCanvas = function(root, options, answer) {
          const prototype = fabric.StaticCanvas.prototype;
          const initialize = prototype.initialize;
          prototype.initialize = function(...args) {
            const result = initialize.apply(this, args);
            root.aiGradingCanvas = this;
            return result;
          };
          try {
            setup.call(this, root, { ...options, editable: false }, answer);
            root.dataset.aiGradingDrawingInitialized = 'true';
          } finally {
            prototype.initialize = initialize;
          }
        };
      })();`,
    });

    const $ = cheerio.load(html, null, false);
    const placeholders = $('img[data-ai-grading-drawing-html]').toArray();
    const scripts: string[] = [];
    const drawings = placeholders.map((placeholder) => {
      const fragment = cheerio.load(
        Buffer.from($(placeholder).attr('data-ai-grading-drawing-html')!, 'base64').toString(
          'utf8',
        ),
        null,
        false,
      );
      fragment('script').each((_, script) => {
        scripts.push(fragment(script).text());
      });
      fragment('script, .pl-drawing-sidebar').remove();
      return fragment.html();
    });
    const rendering = (async () => {
      await page.locator('body').evaluate((body, markup) => {
        body.innerHTML = markup;
      }, drawings.join(''));
      for (const script of scripts) await page.addScriptTag({ content: script });
      await page.waitForFunction('PLDrawingApi.aiGradingDrawingsReady()');
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      const canvases = page.locator('.pl-drawing-container canvas:not(.upper-canvas)');
      for (const [index, placeholder] of placeholders.entries()) {
        const png = await canvases.nth(index).screenshot({ type: 'png' });
        $(placeholder).attr('src', `data:image/png;base64,${png.toString('base64')}`);
        $(placeholder).removeAttr('data-ai-grading-drawing-html');
      }
      return $.html();
    })();
    const pageError = new Promise<never>((_, reject) => page.once('pageerror', reject));
    return await Promise.race([rendering, pageError]);
  } finally {
    await browser.close();
  }
}, 2);

export async function captureAiGradingDrawings(html: string): Promise<string> {
  if (cheerio.load(html, null, false)('img[data-ai-grading-drawing-html]').length === 0) {
    return html;
  }
  return await captureQueue.pushAsync(html);
}
