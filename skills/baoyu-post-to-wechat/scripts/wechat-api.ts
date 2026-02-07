import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

interface WechatConfig {
  appId: string;
  appSecret: string;
}

interface AccessTokenResponse {
  access_token?: string;
  errcode?: number;
  errmsg?: string;
}

interface UploadResponse {
  media_id: string;
  url: string;
  errcode?: number;
  errmsg?: string;
}

interface PublishResponse {
  media_id?: string;
  errcode?: number;
  errmsg?: string;
}

type ArticleType = "news" | "newspic";

interface ArticleOptions {
  title: string;
  author?: string;
  digest?: string;
  content: string;
  thumbMediaId: string;
  articleType: ArticleType;
  imageMediaIds?: string[];
}

const TOKEN_URL = "https://api.weixin.qq.com/cgi-bin/token";
const UPLOAD_URL = "https://api.weixin.qq.com/cgi-bin/material/add_material";
const DRAFT_URL = "https://api.weixin.qq.com/cgi-bin/draft/add";

function loadEnvFile(envPath: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return env;

  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  }
  return env;
}

function loadConfig(): WechatConfig {
  const cwdEnvPath = path.join(process.cwd(), ".baoyu-skills", ".env");
  const homeEnvPath = path.join(os.homedir(), ".baoyu-skills", ".env");

  const cwdEnv = loadEnvFile(cwdEnvPath);
  const homeEnv = loadEnvFile(homeEnvPath);

  const appId = process.env.WECHAT_APP_ID || cwdEnv.WECHAT_APP_ID || homeEnv.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET || cwdEnv.WECHAT_APP_SECRET || homeEnv.WECHAT_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      "Missing WECHAT_APP_ID or WECHAT_APP_SECRET.\n" +
      "Set via environment variables or in .baoyu-skills/.env file."
    );
  }

  return { appId, appSecret };
}

async function fetchAccessToken(appId: string, appSecret: string): Promise<string> {
  const url = `${TOKEN_URL}?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch access token: ${res.status}`);
  }
  const data = await res.json() as AccessTokenResponse;
  if (data.errcode) {
    throw new Error(`Access token error ${data.errcode}: ${data.errmsg}`);
  }
  if (!data.access_token) {
    throw new Error("No access_token in response");
  }
  return data.access_token;
}

function cleanImageMetadata(buffer: Buffer): Buffer {
  // Check if the buffer starts with JPEG signature
  if (buffer.length < 2 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return buffer;
  }
  
  // Check for AIGC or other non-standard metadata in the first 2KB
  const headerStr = buffer.slice(0, Math.min(2048, buffer.length)).toString('binary');
  const hasAigcMarker = headerStr.includes('AIGC{') || headerStr.includes('Coze');
  
  if (!hasAigcMarker) {
    return buffer; // No cleaning needed
  }
  
  console.error(`[wechat-api] Detected non-standard metadata, cleaning...`);
  
  // Find the first valid JPEG segment marker after SOI (ffd8)
  let pos = 2;
  while (pos < buffer.length - 1) {
    if (buffer[pos] === 0xff) {
      const marker = buffer[pos + 1];
      
      // Skip padding bytes (0x00)
      if (marker === 0x00) {
        pos += 2;
        continue;
      }
      
      // Skip non-standard markers like APP11 (0xeb) which contains AIGC data
      if (marker === 0xeb || marker === 0xec || marker === 0xed || marker === 0xee || marker === 0xef) {
        // Read segment length (big-endian)
        if (pos + 3 < buffer.length) {
          const length = (buffer[pos + 2] << 8) | buffer[pos + 3];
          pos += 2 + length;
          continue;
        }
      }
      
      // Valid JPEG markers that indicate start of image data
      // APP0 (0xe0), APP1 (0xe1, EXIF), APP2 (0xe2), DQT (0xdb), SOF0 (0xc0), SOF2 (0xc2)
      if (marker >= 0xe0 && marker <= 0xe9) {
        break;
      }
      if (marker === 0xdb || marker === 0xc0 || marker === 0xc2 || marker === 0xc4) {
        break;
      }
    }
    pos++;
  }
  
  // Return cleaned buffer: SOI (ffd8) + from first valid marker
  const cleaned = Buffer.concat([buffer.slice(0, 2), buffer.slice(pos)]);
  console.error(`[wechat-api] Cleaned ${buffer.length} -> ${cleaned.length} bytes`);
  return cleaned;
}

async function uploadImageWithRetry(
  imagePath: string,
  accessToken: string,
  baseDir?: string,
  retryCount: number = 0
): Promise<UploadResponse> {
  try {
    return await uploadImageInternal(imagePath, accessToken, baseDir, retryCount > 0);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    // If it's an unsupported file type error and we haven't retried yet
    if (errorMsg.includes("40113") && errorMsg.includes("unsupported file type") && retryCount === 0) {
      console.error(`[wechat-api] Upload failed with unsupported file type, retrying with forced metadata cleaning...`);
      return await uploadImageInternal(imagePath, accessToken, baseDir, true);
    }
    
    throw error;
  }
}

async function uploadImageInternal(
  imagePath: string,
  accessToken: string,
  baseDir?: string,
  forceClean: boolean = false
): Promise<UploadResponse> {
  let fileBuffer: Buffer;
  let filename: string;
  let contentType: string;

  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    const response = await fetch(imagePath);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${imagePath}`);
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) {
      throw new Error(`Remote image is empty: ${imagePath}`);
    }
    fileBuffer = Buffer.from(buffer);
    const urlPath = imagePath.split("?")[0];
    filename = path.basename(urlPath) || "image.jpg";
    contentType = response.headers.get("content-type") || "image/jpeg";
  } else {
    const resolvedPath = path.isAbsolute(imagePath)
      ? imagePath
      : path.resolve(baseDir || process.cwd(), imagePath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Image not found: ${resolvedPath}`);
    }
    const stats = fs.statSync(resolvedPath);
    if (stats.size === 0) {
      throw new Error(`Local image is empty: ${resolvedPath}`);
    }
    fileBuffer = fs.readFileSync(resolvedPath);
    filename = path.basename(resolvedPath);
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
    };
    contentType = mimeTypes[ext] || "image/jpeg";
  }

  // Clean metadata for JPEG images (always clean if forceClean is true)
  if (forceClean || contentType === "image/jpeg" || filename.toLowerCase().match(/\.(jpg|jpeg)$/)) {
    fileBuffer = cleanImageMetadata(fileBuffer);
  }

  const boundary = `----WebKitFormBoundary${Date.now().toString(16)}`;
  const header = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="media"; filename="${filename}"`,
    `Content-Type: ${contentType}`,
    "",
    "",
  ].join("\r\n");
  const footer = `\r\n--${boundary}--\r\n`;

  const headerBuffer = Buffer.from(header, "utf-8");
  const footerBuffer = Buffer.from(footer, "utf-8");
  const body = Buffer.concat([headerBuffer, fileBuffer, footerBuffer]);

  const url = `${UPLOAD_URL}?access_token=${accessToken}&type=image`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  const data = await res.json() as UploadResponse;
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`Upload failed ${data.errcode}: ${data.errmsg}`);
  }

  if (data.url?.startsWith("http://")) {
    data.url = data.url.replace(/^http:\/\//i, "https://");
  }

  return data;
}

async function uploadImage(
  imagePath: string,
  accessToken: string,
  baseDir?: string
): Promise<UploadResponse> {
  return uploadImageWithRetry(imagePath, accessToken, baseDir, 0);
}

async function uploadImagesInHtml(
  html: string,
  accessToken: string,
  baseDir: string
): Promise<{ html: string; firstMediaId: string; allMediaIds: string[] }> {
  const imgRegex = /<img[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;
  const matches = [...html.matchAll(imgRegex)];

  if (matches.length === 0) {
    return { html, firstMediaId: "", allMediaIds: [] };
  }

  let firstMediaId = "";
  let updatedHtml = html;
  const allMediaIds: string[] = [];

  for (const match of matches) {
    const [fullTag, src] = match;
    if (!src) continue;

    if (src.startsWith("https://mmbiz.qpic.cn")) {
      if (!firstMediaId) {
        firstMediaId = src;
      }
      continue;
    }

    const localPathMatch = fullTag.match(/data-local-path=["']([^"']+)["']/);
    const imagePath = localPathMatch ? localPathMatch[1]! : src;

    console.error(`[wechat-api] Uploading image: ${imagePath}`);
    try {
      const resp = await uploadImage(imagePath, accessToken, baseDir);
      const newTag = fullTag
        .replace(/\ssrc=["'][^"']+["']/, ` src="${resp.url}"`)
        .replace(/\sdata-local-path=["'][^"']+["']/, "");
      updatedHtml = updatedHtml.replace(fullTag, newTag);
      allMediaIds.push(resp.media_id);
      if (!firstMediaId) {
        firstMediaId = resp.media_id;
      }
    } catch (err) {
      console.error(`[wechat-api] Failed to upload ${imagePath}:`, err);
    }
  }

  return { html: updatedHtml, firstMediaId, allMediaIds };
}

async function publishToDraft(
  options: ArticleOptions,
  accessToken: string
): Promise<PublishResponse> {
  const url = `${DRAFT_URL}?access_token=${accessToken}`;

  let article: Record<string, unknown>;

  if (options.articleType === "newspic") {
    if (!options.imageMediaIds || options.imageMediaIds.length === 0) {
      throw new Error("newspic requires at least one image");
    }
    article = {
      article_type: "newspic",
      title: options.title,
      content: options.content,
      need_open_comment: 1,
      only_fans_can_comment: 0,
      image_info: {
        image_list: options.imageMediaIds.map(id => ({ image_media_id: id })),
      },
    };
    if (options.author) article.author = options.author;
  } else {
    article = {
      article_type: "news",
      title: options.title,
      content: options.content,
      thumb_media_id: options.thumbMediaId,
      need_open_comment: 1,
      only_fans_can_comment: 0,
    };
    if (options.author) article.author = options.author;
    if (options.digest) article.digest = options.digest;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ articles: [article] }),
  });

  const data = await res.json() as PublishResponse;
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`Publish failed ${data.errcode}: ${data.errmsg}`);
  }

  return data;
}

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatter: Record<string, string> = {};
  const lines = match[1]!.split("\n");
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body: match[2]! };
}

function renderMarkdownToHtml(markdownPath: string, theme: string = "default"): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const renderScript = path.join(__dirname, "md", "render.ts");
  const baseDir = path.dirname(markdownPath);

  console.error(`[wechat-api] Rendering markdown with theme: ${theme}`);
  const result = spawnSync("npx", ["-y", "bun", renderScript, markdownPath, "--theme", theme], {
    stdio: ["inherit", "pipe", "pipe"],
    cwd: baseDir,
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || "";
    throw new Error(`Render failed: ${stderr}`);
  }

  const htmlPath = markdownPath.replace(/\.md$/i, ".html");
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`HTML file not generated: ${htmlPath}`);
  }

  return htmlPath;
}

function inlineCss(html: string, css: string): string {
  // Parse CSS rules
  const rules: Array<{ selector: string; declarations: Record<string, string> }> = [];
  const ruleRegex = /([^\{]+)\{([^\}]*)\}/g;
  let match;

  while ((match = ruleRegex.exec(css)) !== null) {
    const selectors = match[1]!.split(',').map(s => s.trim());
    const declarations: Record<string, string> = {};
    const declText = match[2]!;
    const declRegex = /([^:]+):\s*([^;]+);?/g;
    let declMatch;

    while ((declMatch = declRegex.exec(declText)) !== null) {
      const prop = declMatch[1]!.trim();
      const value = declMatch[2]!.trim();
      if (prop && value) {
        declarations[prop] = value;
      }
    }

    for (const selector of selectors) {
      rules.push({ selector, declarations });
    }
  }

  // Apply styles to elements
  let result = html;

  // Remove <style> and <link rel="stylesheet"> tags but keep the content
  result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  result = result.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '');

  // Helper function to merge styles into an element tag
  function mergeStylesIntoTag(tag: string, newStyles: Record<string, string>): string {
    const styleMatch = tag.match(/style=["']([^"]*)["']/);
    let existingStyles: Record<string, string> = {};

    if (styleMatch) {
      // Parse existing styles
      const styleText = styleMatch[1];
      const stylePairs = styleText.split(';').filter(s => s.trim());
      for (const pair of stylePairs) {
        const colonIdx = pair.indexOf(':');
        if (colonIdx > 0) {
          const prop = pair.slice(0, colonIdx).trim();
          const value = pair.slice(colonIdx + 1).trim();
          if (prop && value) {
            existingStyles[prop] = value;
          }
        }
      }
    }

    // Merge new styles (new styles take precedence)
    const mergedStyles = { ...existingStyles, ...newStyles };
    const styleString = Object.entries(mergedStyles)
      .map(([prop, value]) => `${prop}:${value}`)
      .join(';');

    if (styleMatch) {
      // Replace existing style attribute
      return tag.replace(/style=["'][^"]*["']/, `style="${styleString}"`);
    } else {
      // Add new style attribute before the closing >
      return tag.replace(/>$/, ` style="${styleString}">`);
    }
  }

  // Apply inline styles
  for (const rule of rules) {
    const selector = rule.selector;
    const declarations = rule.declarations;

    // Skip universal selector (*) to avoid adding box-sizing to every element
    // This prevents duplicate style issues
    if (selector === '*') {
      continue;
    }

    // Simple class selector: .class
    if (selector.startsWith('.')) {
      const className = selector.slice(1);
      // Match elements that contain this class name
      // Use \\b in template string to represent regex word boundary
      const elementRegex = new RegExp(`<[^>]*\\bclass=["'][^"']*${className}[^"']*["'][^>]*>`, 'gi');

      result = result.replace(elementRegex, (match) => {
        // Double-check that the class name is actually in the class attribute
        const classMatch = match.match(/class=["']([^"']*)["']/);
        if (classMatch && classMatch[1].split(/\s+/).includes(className)) {
          return mergeStylesIntoTag(match, declarations);
        }
        return match;
      });
    }
    // Simple tag selector: tag (exclude html, head, body, meta, link, script, style, title)
    else if (!selector.includes(' ') && !selector.includes(':') && !selector.includes('[')) {
      const skipTags = ['html', 'head', 'body', 'meta', 'link', 'script', 'style', 'title', 'DOCTYPE'];
      if (skipTags.includes(selector.toLowerCase())) {
        continue;
      }

      const tagRegex = new RegExp(`<${selector}([^>]*)>`, 'gi');

      result = result.replace(tagRegex, (match, attrs) => {
        return mergeStylesIntoTag(match, declarations);
      });
    }
  }

  return result;
}

function cleanHtmlWhitespace(html: string): string {
  // Remove empty class attributes
  html = html.replace(/\sclass=""/g, '');
  
  // Minimize whitespace between tags while preserving content
  // This removes indentation spaces that would become &nbsp; in WeChat
  html = html.replace(/>\s+</g, '><');
  
  // Clean up multiple consecutive spaces in text content
  // but preserve single spaces between words
  html = html.replace(/(\S)\s{2,}(\S)/g, '$1 $2');
  
  // Remove leading/trailing whitespace from the entire content
  html = html.trim();
  
  return html;
}

function extractHtmlContent(htmlPath: string, shouldInlineCss: boolean = false): string {
  const html = fs.readFileSync(htmlPath, "utf-8");
  
  // Inline CSS if requested
  let processedHtml = html;
  if (shouldInlineCss) {
    // Extract CSS from <style> tags
    let css = '';
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let styleMatch;
    while ((styleMatch = styleRegex.exec(html)) !== null) {
      css += styleMatch[1] + '\n';
    }
    
    if (css.trim()) {
      console.error("[wechat-api] Inlining CSS styles...");
      processedHtml = inlineCss(html, css);
    }
  }
  
  // Extract content from <body> or specific containers
  let content: string;
  const outputMatch = processedHtml.match(/<div id="output">([\s\S]*?)<\/div>\s*<\/body>/);
  if (outputMatch) {
    content = outputMatch[1]!.trim();
  } else {
    const bodyMatch = processedHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    content = bodyMatch ? bodyMatch[1]!.trim() : processedHtml;
  }
  
  // Clean up whitespace to prevent &nbsp; issues in WeChat
  content = cleanHtmlWhitespace(content);
  
  return content;
}

function printUsage(): never {
  console.log(`Publish article to WeChat Official Account draft using API

Usage:
  npx -y bun wechat-api.ts <file> [options]

Arguments:
  file                Markdown (.md) or HTML (.html) file

Options:
  --type <type>       Article type: news (文章, default) or newspic (图文)
  --title <title>     Override title
  --author <name>     Author name (max 16 chars)
  --summary <text>    Article summary/digest (max 128 chars)
  --theme <name>      Theme name for markdown (default, grace, simple). Default: default
  --cover <path>      Cover image path (local or URL)
  --inline-css        Inline CSS styles for HTML input (preserves original styling)
  --dry-run           Parse and render only, don't publish
  --help              Show this help

Frontmatter Fields (markdown):
  title               Article title
  author              Author name
  digest/summary      Article summary
  featureImage/coverImage/cover/image   Cover image path

Comments:
  Comments are enabled by default, open to all users.

Environment Variables:
  WECHAT_APP_ID       WeChat App ID
  WECHAT_APP_SECRET   WeChat App Secret

Config File Locations (in priority order):
  1. Environment variables
  2. <cwd>/.baoyu-skills/.env
  3. ~/.baoyu-skills/.env

Example:
  npx -y bun wechat-api.ts article.md
  npx -y bun wechat-api.ts article.md --theme grace --cover cover.png
  npx -y bun wechat-api.ts article.md --author "Author Name" --summary "Brief intro"
  npx -y bun wechat-api.ts article.html --title "My Article"
  npx -y bun wechat-api.ts images/ --type newspic --title "Photo Album"
  npx -y bun wechat-api.ts article.md --dry-run
`);
  process.exit(0);
}

interface CliArgs {
  filePath: string;
  isHtml: boolean;
  articleType: ArticleType;
  title?: string;
  author?: string;
  summary?: string;
  theme: string;
  cover?: string;
  inlineCss: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printUsage();
  }

  const args: CliArgs = {
    filePath: "",
    isHtml: false,
    articleType: "news",
    theme: "default",
    inlineCss: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--type" && argv[i + 1]) {
      const t = argv[++i]!.toLowerCase();
      if (t === "news" || t === "newspic") {
        args.articleType = t;
      }
    } else if (arg === "--title" && argv[i + 1]) {
      args.title = argv[++i];
    } else if (arg === "--author" && argv[i + 1]) {
      args.author = argv[++i];
    } else if (arg === "--summary" && argv[i + 1]) {
      args.summary = argv[++i];
    } else if (arg === "--theme" && argv[i + 1]) {
      args.theme = argv[++i]!;
    } else if (arg === "--cover" && argv[i + 1]) {
      args.cover = argv[++i];
    } else if (arg === "--inline-css") {
      args.inlineCss = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg.startsWith("--") && argv[i + 1] && !argv[i + 1]!.startsWith("-")) {
      i++;
    } else if (!arg.startsWith("-")) {
      args.filePath = arg;
    }
  }

  if (!args.filePath) {
    console.error("Error: File path required");
    process.exit(1);
  }

  args.isHtml = args.filePath.toLowerCase().endsWith(".html");

  return args;
}

function extractHtmlTitle(html: string): string {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1]!;
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) return h1Match[1]!.replace(/<[^>]+>/g, "").trim();
  return "";
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const filePath = path.resolve(args.filePath);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const baseDir = path.dirname(filePath);
  let title = args.title || "";
  let author = args.author || "";
  let digest = args.summary || "";
  let htmlPath: string;
  let htmlContent: string;
  let frontmatter: Record<string, string> = {};

  if (args.isHtml) {
    htmlPath = filePath;
    htmlContent = extractHtmlContent(htmlPath, args.inlineCss);
    const mdPath = filePath.replace(/\.html$/i, ".md");
    if (fs.existsSync(mdPath)) {
      const mdContent = fs.readFileSync(mdPath, "utf-8");
      const parsed = parseFrontmatter(mdContent);
      frontmatter = parsed.frontmatter;
      if (!title && frontmatter.title) title = frontmatter.title;
      if (!author) author = frontmatter.author || "";
      if (!digest) digest = frontmatter.digest || frontmatter.summary || frontmatter.description || "";
    }
    if (!title) {
      title = extractHtmlTitle(fs.readFileSync(htmlPath, "utf-8"));
    }
    console.error(`[wechat-api] Using HTML file: ${htmlPath}`);
  } else {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = parseFrontmatter(content);
    frontmatter = parsed.frontmatter;
    const body = parsed.body;

    title = title || frontmatter.title || "";
    if (!title) {
      const h1Match = body.match(/^#\s+(.+)$/m);
      if (h1Match) title = h1Match[1]!;
    }
    if (!author) author = frontmatter.author || "";
    if (!digest) digest = frontmatter.digest || frontmatter.summary || frontmatter.description || "";

    console.error(`[wechat-api] Theme: ${args.theme}`);
    htmlPath = renderMarkdownToHtml(filePath, args.theme);
    console.error(`[wechat-api] HTML generated: ${htmlPath}`);
    htmlContent = extractHtmlContent(htmlPath);
  }

  if (!title) {
    console.error("Error: No title found. Provide via --title, frontmatter, or <title> tag.");
    process.exit(1);
  }

  console.error(`[wechat-api] Title: ${title}`);
  if (author) console.error(`[wechat-api] Author: ${author}`);
  if (digest) console.error(`[wechat-api] Digest: ${digest.slice(0, 50)}...`);
  console.error(`[wechat-api] Type: ${args.articleType}`);

  if (args.dryRun) {
    console.log(JSON.stringify({
      articleType: args.articleType,
      title,
      author: author || undefined,
      digest: digest || undefined,
      htmlPath,
      contentLength: htmlContent.length,
    }, null, 2));
    return;
  }

  const config = loadConfig();
  console.error("[wechat-api] Fetching access token...");
  const accessToken = await fetchAccessToken(config.appId, config.appSecret);

  console.error("[wechat-api] Uploading images...");
  const { html: processedHtml, firstMediaId, allMediaIds } = await uploadImagesInHtml(
    htmlContent,
    accessToken,
    baseDir
  );
  htmlContent = processedHtml;

  let thumbMediaId = "";
  const coverPath = args.cover ||
    frontmatter.featureImage ||
    frontmatter.coverImage ||
    frontmatter.cover ||
    frontmatter.image;

  if (coverPath) {
    console.error(`[wechat-api] Uploading cover: ${coverPath}`);
    const coverResp = await uploadImage(coverPath, accessToken, baseDir);
    thumbMediaId = coverResp.media_id;
  } else if (firstMediaId) {
    if (firstMediaId.startsWith("https://")) {
      console.error(`[wechat-api] Uploading first image as cover: ${firstMediaId}`);
      const coverResp = await uploadImage(firstMediaId, accessToken, baseDir);
      thumbMediaId = coverResp.media_id;
    } else {
      thumbMediaId = firstMediaId;
    }
  }

  if (args.articleType === "news" && !thumbMediaId) {
    console.error("Error: No cover image. Provide via --cover, frontmatter.featureImage, or include an image in content.");
    process.exit(1);
  }

  if (args.articleType === "newspic" && allMediaIds.length === 0) {
    console.error("Error: newspic requires at least one image in content.");
    process.exit(1);
  }

  console.error("[wechat-api] Publishing to draft...");
  const result = await publishToDraft({
    title,
    author: author || undefined,
    digest: digest || undefined,
    content: htmlContent,
    thumbMediaId,
    articleType: args.articleType,
    imageMediaIds: args.articleType === "newspic" ? allMediaIds : undefined,
  }, accessToken);

  console.log(JSON.stringify({
    success: true,
    media_id: result.media_id,
    title,
    articleType: args.articleType,
  }, null, 2));

  console.error(`[wechat-api] Published successfully! media_id: ${result.media_id}`);
}

await main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
