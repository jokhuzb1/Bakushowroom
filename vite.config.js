import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Dev-only endpoint: POST a PNG data URL to /__shot?name=x to save it under ./shots (used for visual QA).
const shots = {
  name: 'shots',
  configureServer(server) {
    server.middlewares.use('/__shot', (req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const name = new URL(req.url, 'http://x').searchParams.get('name') || 'shot';
        fs.mkdirSync('shots', { recursive: true });
        fs.writeFileSync(path.join('shots', `${name.replace(/[^\w-]/g, '')}.png`), Buffer.from(body.split(',')[1], 'base64'));
        res.end('ok');
      });
    });
    // Dev-only: list of model ids in public/models (used by models.html)
    server.middlewares.use('/__models', (req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(fs.readdirSync('public/models').filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4))));
    });
    // Dev-only: POST raw bytes to /__pano?file=<path> to write a 360° bake file (pano-bake.html).
    // Only bake/out/ (scenes for Blender) and public/pano/ (tour data) can be written.
    server.middlewares.use('/__pano', (req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const file = path.normalize(new URL(req.url, 'http://x').searchParams.get('file') || '').replace(/\\/g, '/');
        if (!/^(bake\/out|public\/pano)\/[\w./-]+$/.test(file) || file.includes('..')) { res.statusCode = 400; return res.end('bad path'); }
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.concat(chunks));
        res.end('ok');
      });
    });
    // Dev-only: POST a data URL or JSON to /__bake?file=name.ext to write public/textures/<file> (texture baking).
    server.middlewares.use('/__bake', (req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const file = (new URL(req.url, 'http://x').searchParams.get('file') || '').replace(/[^\w.-]/g, '');
        if (!file) { res.statusCode = 400; return res.end('no file'); }
        fs.mkdirSync('public/textures', { recursive: true });
        const data = body.startsWith('data:') ? Buffer.from(body.split(',')[1], 'base64') : body;
        fs.writeFileSync(path.join('public/textures', file), data);
        res.end('ok');
      });
    });
  },
};

export default defineConfig({ plugins: [shots] });
