// Genera artifact/index.html: la app en un único archivo (CSS y JS en línea) para la vista previa.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
const dir = 'dist/assets/';
const files = readdirSync(dir);
const css = readFileSync(dir + files.find((f) => f.endsWith('.css')), 'utf8');
const js = readFileSync(dir + files.find((f) => f.endsWith('.js')), 'utf8');
if (/<\/script/i.test(js)) throw new Error('El JS contiene </script>');
const html = `<title>Control de Obras</title>
<meta name="theme-color" content="#1d56b0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@600;700&display=swap" rel="stylesheet">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/index.html', html);
console.log('artifact/index.html', (html.length / 1024).toFixed(0), 'KB');
