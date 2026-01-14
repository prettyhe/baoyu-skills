---
name: post-to-x
description: Post content and articles to X (Twitter). Supports regular posts with images and X Articles (long-form Markdown). Uses real Chrome with CDP to bypass anti-automation.
---

# Post to X (Twitter)

Post content, images, and long-form articles to X using real Chrome browser (bypasses anti-bot detection).

## Features

- **Regular Posts**: Text + up to 4 images
- **X Articles**: Publish Markdown files with rich formatting and images (requires X Premium)

## Usage

```bash
# Post text only
/post-to-x "Your post content here"

# Post with image
/post-to-x "Your post content" --image /path/to/image.png

# Post with multiple images (up to 4)
/post-to-x "Your post content" --image img1.png --image img2.png

# Actually submit the post
/post-to-x "Your post content" --submit
```

## Prerequisites

- Google Chrome or Chromium installed
- `bun` installed (for running scripts)
- First run: log in to X in the opened browser window

## Quick Start (Recommended)

Use the `x-browser.ts` script directly:

```bash
# Preview mode (doesn't post)
npx -y bun ./scripts/x-browser.ts "Hello from Claude!" --image ./screenshot.png

# Actually post
npx -y bun ./scripts/x-browser.ts "Hello!" --image ./photo.png --submit
```

The script:
1. Launches real Chrome with anti-detection disabled
2. Uses persistent profile (only need to log in once)
3. Types text and pastes images via CDP
4. Waits 30s for preview (or posts immediately with `--submit`)

## Manual Workflow

If you prefer step-by-step control:

### Step 1: Copy Image to Clipboard

```bash
npx -y bun ./scripts/copy-to-clipboard.ts image /path/to/image.png
```

### Step 2: Use Playwright MCP (if Chrome session available)

```bash
# Navigate
mcp__playwright__browser_navigate url="https://x.com/compose/post"

# Get element refs
mcp__playwright__browser_snapshot

# Type text
mcp__playwright__browser_click element="editor" ref="<ref>"
mcp__playwright__browser_type element="editor" ref="<ref>" text="Your content"

# Paste image (after copying to clipboard)
mcp__playwright__browser_press_key key="Meta+v"  # macOS
# or
mcp__playwright__browser_press_key key="Control+v"  # Windows/Linux

# Screenshot to verify
mcp__playwright__browser_take_screenshot filename="preview.png"
```

## Parameters

| Parameter | Description |
|-----------|-------------|
| `<text>` | Post content (positional argument) |
| `--image <path>` | Image file path (can be repeated, max 4) |
| `--submit` | Actually post (default: preview only) |
| `--profile <dir>` | Custom Chrome profile directory |

## Image Support

- Formats: PNG, JPEG, GIF, WebP
- Max 4 images per post
- Images copied to system clipboard, then pasted via keyboard shortcut

## Example Session

```
User: /post-to-x "Hello from Claude!" --image ./screenshot.png

Claude:
1. Runs: npx -y bun ./scripts/x-browser.ts "Hello from Claude!" --image ./screenshot.png
2. Chrome opens with X compose page
3. Text is typed into editor
4. Image is copied to clipboard and pasted
5. Browser stays open 30s for preview
6. Reports: "Post composed. Use --submit to post."
```

## Troubleshooting

- **Chrome not found**: Set `X_BROWSER_CHROME_PATH` environment variable
- **Not logged in**: First run opens Chrome - log in manually, cookies are saved
- **Image paste fails**: Verify clipboard script: `npx -y bun ./scripts/copy-to-clipboard.ts image <path>`
- **Rate limited**: Wait a few minutes before retrying

## How It Works

The `x-browser.ts` script uses Chrome DevTools Protocol (CDP) to:
1. Launch real Chrome (not Playwright) with `--disable-blink-features=AutomationControlled`
2. Use persistent profile directory for saved login sessions
3. Interact with X via CDP commands (Runtime.evaluate, Input.dispatchKeyEvent)
4. Paste images from system clipboard

This approach bypasses X's anti-automation detection that blocks Playwright/Puppeteer.

## Notes

- First run requires manual login (session is saved)
- Always preview before using `--submit`
- Browser closes automatically after operation
- Supports macOS, Linux, and Windows

---

# X Articles (Long-form Publishing)

Publish Markdown articles to X Articles editor with rich text formatting and images.

## X Article Usage

```bash
# Publish markdown article (preview mode)
/post-to-x article /path/to/article.md

# With custom cover image
/post-to-x article article.md --cover ./hero.png

# With custom title
/post-to-x article article.md --title "My Custom Title"

# Actually publish (not just draft)
/post-to-x article article.md --submit
```

## Prerequisites for Articles

- X Premium subscription (required for Articles)
- Google Chrome installed
- `bun` installed

## Article Script

Use `x-article.ts` directly:

```bash
npx -y bun ./scripts/x-article.ts article.md
npx -y bun ./scripts/x-article.ts article.md --cover ./cover.jpg
npx -y bun ./scripts/x-article.ts article.md --submit
```

## Markdown Format

```markdown
---
title: My Article Title
cover_image: /path/to/cover.jpg
---

# Title (becomes article title)

Regular paragraph text with **bold** and *italic*.

## Section Header

More content here.

![Image alt text](./image.png)

- List item 1
- List item 2

1. Numbered item
2. Another item

> Blockquote text

[Link text](https://example.com)

\`\`\`
Code blocks become blockquotes (X doesn't support code)
\`\`\`
```

## Frontmatter Fields

| Field | Description |
|-------|-------------|
| `title` | Article title (or uses first H1) |
| `cover_image` | Cover image path or URL |
| `cover` | Alias for cover_image |
| `image` | Alias for cover_image |

## Image Handling

1. **Cover Image**: First image or `cover_image` from frontmatter
2. **Remote Images**: Automatically downloaded to temp directory
3. **Placeholders**: Images in content use `[[IMAGE_PLACEHOLDER_N]]` format
4. **Insertion**: Placeholders are found, selected, and replaced with actual images

## Markdown to HTML Script

Convert markdown and inspect structure:

```bash
# Get JSON with all metadata
npx -y bun ./scripts/md-to-html.ts article.md

# Output HTML only
npx -y bun ./scripts/md-to-html.ts article.md --html-only

# Save HTML to file
npx -y bun ./scripts/md-to-html.ts article.md --save-html /tmp/article.html
```

JSON output:
```json
{
  "title": "Article Title",
  "coverImage": "/path/to/cover.jpg",
  "contentImages": [
    {
      "placeholder": "[[IMAGE_PLACEHOLDER_1]]",
      "localPath": "/tmp/x-article-images/img.png",
      "blockIndex": 5
    }
  ],
  "html": "<p>Content...</p>",
  "totalBlocks": 20
}
```

## Supported Formatting

| Markdown | HTML Output |
|----------|-------------|
| `# H1` | Title only (not in body) |
| `## H2` - `###### H6` | `<h2>` |
| `**bold**` | `<strong>` |
| `*italic*` | `<em>` |
| `[text](url)` | `<a href>` |
| `> quote` | `<blockquote>` |
| `` `code` `` | `<code>` |
| ```` ``` ```` | `<blockquote>` (X limitation) |
| `- item` | `<ul><li>` |
| `1. item` | `<ol><li>` |
| `![](img)` | Image placeholder |

## Article Workflow

1. **Parse Markdown**: Extract title, cover, content images, generate HTML
2. **Launch Chrome**: Real browser with CDP, persistent login
3. **Navigate**: Open `x.com/compose/articles`
4. **Create Article**: Click create button if on list page
5. **Upload Cover**: Use file input for cover image
6. **Fill Title**: Type title into title field
7. **Paste Content**: Copy HTML to clipboard, paste into editor
8. **Insert Images**: For each placeholder (reverse order):
   - Find placeholder text in editor
   - Select the placeholder
   - Copy image to clipboard
   - Paste to replace selection
9. **Review**: Browser stays open for 60s preview
10. **Publish**: Only with `--submit` flag

## Article Example Session

```
User: /post-to-x article ./blog/my-post.md --cover ./thumbnail.png

Claude:
1. Parses markdown: title="My Post", 3 content images
2. Launches Chrome with CDP
3. Navigates to x.com/compose/articles
4. Clicks create button
5. Uploads thumbnail.png as cover
6. Fills title "My Post"
7. Pastes HTML content
8. Inserts 3 images at placeholder positions
9. Reports: "Article composed. Review and use --submit to publish."
```

## Article Troubleshooting

- **No create button**: Ensure X Premium subscription is active
- **Cover upload fails**: Check file path and format (PNG, JPEG)
- **Images not inserting**: Verify placeholders exist in pasted content
- **Content not pasting**: Check HTML clipboard: `npx -y bun ./scripts/copy-to-clipboard.ts html --file /tmp/test.html`

## How Article Publishing Works

1. `md-to-html.ts` converts Markdown to HTML:
   - Extracts frontmatter (title, cover)
   - Converts markdown to HTML
   - Replaces images with unique placeholders
   - Downloads remote images locally
   - Returns structured JSON

2. `x-article.ts` publishes via CDP:
   - Launches real Chrome (bypasses detection)
   - Uses persistent profile (saved login)
   - Navigates and fills editor via DOM manipulation
   - Pastes HTML from system clipboard
   - Finds/selects/replaces each image placeholder

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `x-browser.ts` | Regular posts (text + images) |
| `x-article.ts` | Article publishing (Markdown) |
| `md-to-html.ts` | Markdown → HTML conversion |
| `copy-to-clipboard.ts` | Copy image/HTML to clipboard |
