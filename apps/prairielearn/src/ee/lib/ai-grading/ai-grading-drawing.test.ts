import * as cheerio from 'cheerio';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { stripHtmlForAiGrading } from './ai-grading-render.js';
import { prepareQuestionPrompt } from './ai-grading-util.js';

describe('AI grading drawing capture', () => {
  it('captures saved drawing objects and mathematical labels as PNG file parts', async () => {
    const html = `<p>Compare these drawings.</p>${[1, 2]
      .map(
        (id) => `
      <div id="drawing-${id}" class="pl-drawing-container">
        <div class="pl-drawing-main"><canvas width="200" height="100" aria-label="Diagram ${id}"></canvas></div>
      </div>
      <script>$(function() {
        PLDrawingApi.setupCanvas(document.getElementById('drawing-${id}'), {
          width: 200, height: 100, render_scale: 1, editable: false, grid_size: 0,
          element_client_files: {}, snap_to_grid: false
        }, [
          { id: ${id}, type: 'pl-rectangle', left: 20, top: 20, width: 60, height: 40,
            fill: '${id === 1 ? 'red' : 'blue'}', selectable: false },
          { id: ${id + 2}, type: 'pl-text', label: '$x^2$', latex: true, left: 100,
            top: 20, offsetx: 0, offsety: 0, fontSize: 20, selectable: false }
        ]);
      });</script>`,
      )
      .join('')}`;
    const stripped = await stripHtmlForAiGrading(html);
    const $ = cheerio.load(stripped);
    expect($('script, canvas')).toHaveLength(0);
    expect($('img[data-ai-grading-drawing-html]')).toHaveLength(2);

    const parts = await prepareQuestionPrompt(stripped, 'answer');
    const files = parts.filter((part) => part.type === 'file');
    expect(files).toHaveLength(2);
    const pngs = files.map((file) => Buffer.from(file.data as string, 'base64'));
    expect(pngs[0].equals(pngs[1])).toBe(false);
    for (const png of pngs) {
      const metadata = await sharp(png).metadata();
      expect(metadata.format).toBe('png');
      expect(metadata.width).toBeGreaterThan(0);
    }
    expect(parts[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('Compare these drawings.'),
    });
    expect(JSON.stringify(parts)).not.toContain('data-ai-grading-drawing-html');
    expect(JSON.stringify(parts)).not.toContain('<script');
    expect(files.every((file) => file.mediaType === 'image/png')).toBe(true);
  }, 60_000);
});
