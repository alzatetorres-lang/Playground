// Empaqueta el frontend para producción: JS minificado con división en trozos (el 3D va aparte
// y se descarga en diferido), CSS minificado y nombres con hash para poder cachearlos un año.
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const outdir = path.join(root, 'public', 'dist');

// Las rutas /vendor/... del navegador apuntan a node_modules al empaquetar.
const vendorPaths = {
  name: 'vendor-paths',
  setup(build) {
    build.onResolve({ filter: /^\/vendor\/three\// }, a => ({ path: path.join(root, 'node_modules', 'three', 'build', a.path.replace('/vendor/three/', '')) }));
    build.onResolve({ filter: /^\/vendor\/three-addons\// }, a => ({ path: path.join(root, 'node_modules', 'three', 'examples', 'jsm', a.path.replace('/vendor/three-addons/', '')) }));
  },
};

async function buildAssets() {
  const esbuild = require('esbuild');
  fs.rmSync(outdir, { recursive: true, force: true });
  const common = { bundle: true, minify: true, sourcemap: true, outdir, metafile: true, legalComments: 'none', logLevel: 'warning' };
  const js = await esbuild.build({
    ...common,
    entryPoints: [path.join(root, 'public', 'js', 'main.js')],
    format: 'esm', splitting: true, target: 'es2022',
    entryNames: '[name]-[hash]', chunkNames: 'c-[hash]',
    external: ['/socket.io/*'],
    plugins: [vendorPaths],
  });
  const css = await esbuild.build({
    ...common,
    entryPoints: [path.join(root, 'public', 'css', 'app.css')],
    entryNames: '[name]-[hash]',
    external: ['/fonts/*', '/img/*'],
  });
  const entry = (meta, ext) => Object.entries(meta.outputs).find(([file, o]) => o.entryPoint && file.endsWith(ext))[0];
  const rel = file => '/' + path.relative(path.join(root, 'public'), path.join(root, file)).split(path.sep).join('/');
  const main = entry(js.metafile, '.js');
  // Trozos que main importa de forma estática: se precargan para no encadenar peticiones.
  const preload = js.metafile.outputs[main].imports.filter(i => i.kind === 'import-statement' && !i.external).map(i => rel(i.path));
  return { js: rel(main), css: rel(entry(css.metafile, '.css')), preload };
}

module.exports = { buildAssets };
