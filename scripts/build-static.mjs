import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const projectDir = path.join(repoRoot, 'PortfolioWebsite_BENITEZ');
const viewsDir = path.join(projectDir, 'Views');
const wwwrootDir = path.join(projectDir, 'wwwroot');
const distDir = path.join(repoRoot, 'dist');

const ROUTES = {
  Index: '/',
  Achievements: '/Home/Achievements',
  Portfolio: '/Home/Portfolio',
  Contact: '/Home/Contact',
  Privacy: '/Home/Privacy',
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function hashFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
}

/**
 * Extracts a Razor `@section Name { ... }` block using balanced brace matching
 * and returns { sectionContent, remainingSource }.
 */
function extractSection(source, sectionName) {
  const marker = new RegExp(`@section\\s+${sectionName}\\s*\\{`);
  const match = marker.exec(source);
  if (!match) {
    return { sectionContent: '', remainingSource: source };
  }

  const startBrace = match.index + match[0].length - 1;
  let depth = 0;
  let endBrace = -1;
  for (let i = startBrace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        endBrace = i;
        break;
      }
    }
  }

  if (endBrace === -1) {
    throw new Error(`Unclosed @section ${sectionName} block`);
  }

  const sectionContent = source.slice(startBrace + 1, endBrace).trim();
  const remainingSource = (source.slice(0, match.index) + source.slice(endBrace + 1)).trim();
  return { sectionContent, remainingSource };
}

/**
 * Extracts leading `@{ ... }` Razor code block and parses ViewData Title/Description.
 */
function extractFrontMatter(source) {
  const normalized = source.replace(/^\uFEFF/, '');
  const match = /^@\{([\s\S]*?)\}\s*/.exec(normalized);
  if (!match) {
    return { title: 'Portfolio', description: '', body: normalized };
  }

  const block = match[1];
  const titleMatch = /ViewData\["Title"\]\s*=\s*"([^"]*)"/.exec(block);
  const descMatch = /ViewData\["Description"\]\s*=\s*"([^"]*)"/.exec(block);

  return {
    title: titleMatch ? titleMatch[1] : 'Portfolio',
    description: descMatch ? descMatch[1] : '',
    body: normalized.slice(match[0].length).trim(),
  };
}

/**
 * Transforms Razor directives, tag helpers, and app-relative paths to static HTML.
 */
function transformRazorFragment(fragment, assetHashes) {
  let out = fragment;

  // Replace escaped Razor @@ -> @
  out = out.replace(/@@/g, '@');

  // Replace ASP.NET Core MVC anchor tag helpers with static routes
  out = out.replace(
    /<a\b([^>]*?)>/gi,
    (fullTag, attrs) => {
      const ctrlMatch = /\basp-controller\s*=\s*"([^"]*)"/i.exec(attrs);
      const actMatch = /\basp-action\s*=\s*"([^"]*)"/i.exec(attrs);
      if (!ctrlMatch && !actMatch) return fullTag;

      const controller = ctrlMatch ? ctrlMatch[1] : 'Home';
      const action = actMatch ? actMatch[1] : 'Index';
      if (controller !== 'Home' || !(action in ROUTES)) {
        throw new Error(`Unsupported MVC tag helper route: ${controller}/${action}`);
      }

      const cleanedAttrs = attrs
        .replace(/\s*\basp-controller\s*=\s*"[^"]*"/gi, '')
        .replace(/\s*\basp-action\s*=\s*"[^"]*"/gi, '')
        .trim();

      return `<a href="${ROUTES[action]}"${cleanedAttrs ? ' ' + cleanedAttrs : ''}>`;
    }
  );

  // Resolve ~/ asset URLs in href, src, poster attributes
  out = out.replace(/\b(href|src|poster)\s*=\s*"~\/([^"]*)"/gi, (_, attr, relPath) => {
    return `${attr}="/${relPath}"`;
  });

  // Replace asp-append-version="true" with content hash query param where available
  out = out.replace(
    /\b(href|src)\s*=\s*"(\/[^"?]+)"([^>]*?)\s*\basp-append-version\s*=\s*"true"/gi,
    (_, attr, urlPath, middle) => {
      const hash = assetHashes.get(urlPath);
      const versioned = hash ? `${urlPath}?v=${hash}` : urlPath;
      return `${attr}="${versioned}"${middle}`;
    }
  );
  out = out.replace(/\s*\basp-append-version\s*=\s*"true"/gi, '');

  return out;
}

/**
 * Case-sensitive filesystem check (crucial when building on Windows for Linux/Vercel CDN).
 */
function existsCaseSensitive(rootDir, relPosixPath) {
  const segments = relPosixPath.split('/').filter(Boolean);
  let current = rootDir;
  for (const seg of segments) {
    if (!fs.existsSync(current)) return false;
    const entries = fs.readdirSync(current);
    if (!entries.includes(seg)) return false;
    current = path.join(current, seg);
  }
  return fs.existsSync(current);
}

function verifyStaticOutput(htmlFiles) {
  const knownRoutes = new Set([...Object.values(ROUTES), '/']);
  const errors = [];

  for (const filePath of htmlFiles) {
    const html = fs.readFileSync(filePath, 'utf8');
    const relHtml = path.relative(distDir, filePath);

    // Check for leaked Razor syntax
    const leaked = html.match(/@\{|@(ViewData|RenderBody|RenderSectionAsync|section|using|model)\b|\basp-(controller|action|append-version)\b|"\~\//g);
    if (leaked) {
      errors.push(`${relHtml}: unrendered Razor syntax detected: ${leaked.join(', ')}`);
    }

    // Check every local asset and route reference
    const urlMatches = [
      ...html.matchAll(/\b(?:src|href|poster)\s*=\s*"(\/[^"#?]*)(?:[?#][^"]*)?"/gi),
      ...html.matchAll(/url\(\s*['"]?(\/[^'")?#]+)(?:[?#][^'")]+)?['"]?\s*\)/gi),
    ];

    for (const m of urlMatches) {
      const urlPath = decodeURIComponent(m[1]);
      if (knownRoutes.has(urlPath)) continue;
      const relAsset = urlPath.replace(/^\/+/, '');
      if (!existsCaseSensitive(distDir, relAsset)) {
        errors.push(`${relHtml}: missing or case-mismatched local asset "${urlPath}"`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Static verification failed:\n - ${errors.join('\n - ')}`);
  }
}

function main() {
  const verifyOnly = process.argv.includes('--verify-only');

  if (!verifyOnly) {
    fs.rmSync(distDir, { recursive: true, force: true });
    fs.mkdirSync(distDir, { recursive: true });

    // Copy wwwroot static assets
    fs.cpSync(wwwrootDir, distDir, { recursive: true });

    // Provide empty scoped styles file so _Layout's link resolves 200 OK cleanly
    fs.writeFileSync(
      path.join(distDir, 'PortfolioWebsite_BENITEZ.styles.css'),
      '/* Static build placeholder for ASP.NET Core CSS isolation bundle */\n',
      'utf8'
    );
  }

  // Compute hashes for cache-busted local assets
  const assetHashes = new Map();
  for (const rel of ['/css/site.css', '/js/site.js', '/PortfolioWebsite_BENITEZ.styles.css']) {
    const full = path.join(distDir, rel.slice(1));
    if (fs.existsSync(full)) {
      assetHashes.set(rel, hashFile(full));
    }
  }

  const layoutRaw = fs.readFileSync(path.join(viewsDir, 'Shared', '_Layout.cshtml'), 'utf8').replace(/^\uFEFF/, '');
  const layoutTransformed = transformRazorFragment(layoutRaw, assetHashes);

  const pages = [
    { view: path.join(viewsDir, 'Home', 'Index.cshtml'), out: 'index.html' },
    { view: path.join(viewsDir, 'Home', 'Achievements.cshtml'), out: 'Home/Achievements.html' },
    { view: path.join(viewsDir, 'Home', 'Portfolio.cshtml'), out: 'Home/Portfolio.html' },
    { view: path.join(viewsDir, 'Home', 'Contact.cshtml'), out: 'Home/Contact.html' },
    { view: path.join(viewsDir, 'Home', 'Privacy.cshtml'), out: 'Home/Privacy.html' },
  ];

  const generatedFiles = [];

  for (const page of pages) {
    const raw = fs.readFileSync(page.view, 'utf8');
    const { title, description, body: withoutFrontMatter } = extractFrontMatter(raw);
    const { sectionContent: stylesRaw, remainingSource: afterStyles } = extractSection(withoutFrontMatter, 'Styles');
    const { sectionContent: scriptsRaw, remainingSource: bodyRaw } = extractSection(afterStyles, 'Scripts');

    const safeTitle = escapeHtml(title);
    const safeDesc = escapeHtml(
      description || 'Portfolio website of Hermione Benitez — BSIT student, UI/UX Designer, Graphic Designer, and Frontend Developer.'
    );

    const renderedBody = transformRazorFragment(bodyRaw, assetHashes).replace(/@ViewData\["Title"\]/g, safeTitle);
    const renderedStyles = transformRazorFragment(stylesRaw, assetHashes);
    const renderedScripts = transformRazorFragment(scriptsRaw, assetHashes);

    let fullHtml = layoutTransformed
      .replace(/@ViewData\["Title"\]/g, safeTitle)
      .replace(/@\(ViewData\["Description"\] \?\? "[^"]*"\)/g, safeDesc)
      .replace('@await RenderSectionAsync("Styles", required: false)', renderedStyles)
      .replace('@RenderBody()', renderedBody)
      .replace('@await RenderSectionAsync("Scripts", required: false)', renderedScripts);

    const outPath = path.join(distDir, page.out);
    if (!verifyOnly) {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, fullHtml, 'utf8');
    }
    generatedFiles.push(outPath);
  }

  // Generate static 404.html from Error.cshtml design
  const errorRaw = fs.readFileSync(path.join(viewsDir, 'Shared', 'Error.cshtml'), 'utf8');
  const { sectionContent: errStylesRaw } = extractSection(errorRaw, 'Styles');
  const errBody = `
<div class="ambient-canvas" aria-hidden="true">
    <span class="ambient-orb ambient-orb--one"></span>
    <span class="ambient-orb ambient-orb--two"></span>
</div>

<section class="error-container">
    <div class="glass-card error-card" data-spotlight data-reveal="scale">
        <div class="error-code">404</div>
        <h1>Page Not Found</h1>
        <p class="error-message">The page you are looking for doesn't exist or has been moved.</p>
        <a class="btn-glow" href="/">Back to Home</a>
    </div>
</section>`.trim();
  const errHtml = layoutTransformed
    .replace(/@ViewData\["Title"\]/g, 'Page Not Found')
    .replace(/@\(ViewData\["Description"\] \?\? "[^"]*"\)/g, 'Page not found on Hermione Benitez Portfolio Website.')
    .replace('@await RenderSectionAsync("Styles", required: false)', transformRazorFragment(errStylesRaw, assetHashes))
    .replace('@RenderBody()', errBody)
    .replace('@await RenderSectionAsync("Scripts", required: false)', '');

  const notFoundOut = path.join(distDir, '404.html');
  if (!verifyOnly) {
    fs.writeFileSync(notFoundOut, errHtml, 'utf8');
  }
  generatedFiles.push(notFoundOut);

  verifyStaticOutput(generatedFiles);
  console.log(`Static build ${verifyOnly ? 'verified' : 'generated'} successfully (${generatedFiles.length} HTML pages in dist/).`);
}

main();
