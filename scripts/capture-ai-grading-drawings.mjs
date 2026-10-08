import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { chromium } from '@playwright/test';

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    output: { type: 'string' },
    selector: { type: 'string', default: 'body' },
    'ready-selector': { type: 'string' },
    'storage-state': { type: 'string' },
    help: { type: 'boolean' },
  },
});

if (values.help) {
  process.stdout.write(`Capture pl-drawing canvases from a rendered question page.

Usage:
  node scripts/capture-ai-grading-drawings.mjs \\
    --url <question-page-url> --output <output.html> \\
    [--selector <question-root>] [--ready-selector <extra-readiness-selector>] \\
    [--storage-state <playwright-storage-state.json>]

Drawing initialization and built-in mathematical labels are awaited automatically.
Use an additional readiness selector for asynchronous custom drawing extensions.
The output embeds PNGs as image data URLs for prepareQuestionPrompt().
`);
} else {
  if (!values.url || !values.output) {
    throw new Error('Provide --url and --output. Use --help for details.');
  }

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      storageState: values['storage-state'],
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    // Keep the capture hook in this browser session instead of changing the element runtime.
    await page.route(/\/pl-drawing\.js(?:\?|$)/, async (route) => {
      const response = await route.fetch();
      const source = await response.text();
      await route.fulfill({
        response,
        body: `${source}
(() => {
  const setupCanvas = window.PLDrawingApi.setupCanvas;
  window.PLDrawingApi.setupCanvas = function(root, options, answer) {
    const prototype = (options.editable ? fabric.Canvas : fabric.StaticCanvas).prototype;
    const initialize = prototype.initialize;
    prototype.initialize = function(...args) {
      const result = initialize.apply(this, args);
      root.__aiGradingCanvas = this;
      return result;
    };
    try {
      const result = setupCanvas.call(this, root, options, answer);
      root.dataset.aiGradingDrawingInitialized = 'true';
      return result;
    } finally {
      prototype.initialize = initialize;
    }
  };
})();`,
      });
    });
    await page.goto(values.url);
    if (values['ready-selector']) {
      await page.locator(values['ready-selector']).waitFor({ state: 'attached' });
    }
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    const root = page.locator(values.selector);
    const canvases = root.locator('.pl-drawing-container canvas:not(.upper-canvas)');
    const count = await canvases.count();
    if (count === 0) {
      throw new Error('No pl-drawing canvases found in the selected page region.');
    }

    await page.waitForFunction((selector) => {
      const drawings = document.querySelector(selector).querySelectorAll('.pl-drawing-container');
      const objectsReady = (objects) =>
        objects.every((object) => {
          if (object.type === 'latex-text' && object.label.trim() && !object.image) return false;
          return !object.getObjects || objectsReady(object.getObjects());
        });
      return [...drawings].every((drawing) => {
        const canvas = drawing.__aiGradingCanvas;
        if (!drawing.dataset.aiGradingDrawingInitialized || !canvas) return false;
        if (!objectsReady(canvas.getObjects())) return false;
        canvas.renderAll();
        return true;
      });
    }, values.selector);

    const images = [];
    for (let index = 0; index < count; index++) {
      const canvas = canvases.nth(index);
      const image = await canvas.screenshot({ type: 'png' });
      images.push({
        src: `data:image/png;base64,${image.toString('base64')}`,
        alt: (await canvas.getAttribute('aria-label')) ?? `Drawing ${index + 1}`,
      });
    }

    const html = await root.evaluate((element, capturedImages) => {
      const clone = element.cloneNode(true);
      const canvases = clone.querySelectorAll('.pl-drawing-container canvas:not(.upper-canvas)');
      canvases.forEach((canvas, index) => {
        const image = document.createElement('img');
        image.src = capturedImages[index].src;
        image.alt = capturedImages[index].alt;
        canvas.replaceWith(image);
      });
      clone
        .querySelectorAll('script, .pl-drawing-sidebar, .pl-drawing-container canvas.upper-canvas')
        .forEach((element) => element.remove());
      // Preserve relative asset references when this HTML is processed outside the page.
      clone.querySelectorAll('img[src]').forEach((image) => {
        image.setAttribute('src', new URL(image.getAttribute('src'), document.baseURI).href);
      });
      return clone.innerHTML;
    }, images);

    await writeFile(values.output, html);
    process.stdout.write(`Captured ${count} drawing(s) in ${values.output}\n`);
  } finally {
    await browser.close();
  }
}
