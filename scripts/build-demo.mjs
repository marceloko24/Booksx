// Builds a self-contained demo page: dist/booksx-demo.html
// Usage: node scripts/build-demo.mjs
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const result = await build({
  entryPoints: [join(root, "scripts/artifact-entry.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  write: false,
  logLevel: "warning",
  tsconfig: join(root, "tsconfig.json"),
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_STATIC_DEMO": '"1"',
  },
});
let js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

let css = readFileSync(join(root, "app/globals.css"), "utf8");
// follow the OS theme before the app's own setting applies
const dark = css.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/);
if (dark) css += `\n@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {${dark[1]}\n} }\n`;
// one-screen app inside the host's safe-area padding
css += `\nhtml, body { height: 100%; }\n.app { height: 100%; }\n#root { height: 100%; }\n`;

const html = `<title>BOOKSX</title>
<style>${css}</style>
<div id="root"></div>
<script>${js}</script>
`;
mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist/booksx-demo.html"), html);
console.log(`dist/booksx-demo.html ${(html.length / 1024).toFixed(0)} KB`);

// Installable static site (PWA): dist/web — upload this folder to any static host.
const web = join(root, "dist/web");
rmSync(web, { recursive: true, force: true });
mkdirSync(web, { recursive: true });
const page = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>BOOKSX</title>
<meta name="description" content="Páginas, bases de datos, tareas e IA en un solo espacio de trabajo.">
<meta name="theme-color" content="#4f46e5">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="BOOKSX">
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
<script>
if ("serviceWorker" in navigator) {
  addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
}
</script>
</body>
</html>
`;
writeFileSync(join(web, "index.html"), page);
for (const f of ["manifest.webmanifest", "sw.js", "favicon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"]) {
  copyFileSync(join(root, "public", f), join(web, f));
}
writeFileSync(join(web, ".nojekyll"), "");
console.log("dist/web/ (installable app)");
