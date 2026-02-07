#!/usr/bin/env bun
/**
 * Generate cover image for WeChat articles using Node.js canvas
 * Fallback solution when ImageMagick is not available
 */

import fs from "node:fs";
import path from "node:path";

interface CoverOptions {
  title: string;
  width?: number;
  height?: number;
  output: string;
  gradientStart?: string;
  gradientEnd?: string;
  textColor?: string;
}

function printUsage(): void {
  console.log(`Generate cover image for WeChat articles

Usage:
  npx -y bun generate-cover.ts --title <title> --output <path> [options]

Required:
  --title <text>      Article title (will be auto-wrapped)
  --output <path>     Output image path (e.g., cover.jpg)

Optional:
  --width <number>    Image width (default: 900)
  --height <number>   Image height (default: 500)
  --gradient-start    Gradient start color (default: #667eea)
  --gradient-end      Gradient end color (default: #764ba2)
  --text-color        Text color (default: white)

Examples:
  npx -y bun generate-cover.ts --title "My Article" --output cover.jpg
  npx -y bun generate-cover.ts --title "Claude Code 最佳实践" --output cover.png --gradient-start "#ff6b6b" --gradient-end "#4ecdc4"
`);
  process.exit(0);
}

function parseArgs(argv: string[]): CoverOptions {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printUsage();
  }

  const options: CoverOptions = {
    title: "",
    width: 900,
    height: 500,
    output: "",
    gradientStart: "#667eea",
    gradientEnd: "#764ba2",
    textColor: "white",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--title" && argv[i + 1]) {
      options.title = argv[++i]!;
    } else if (arg === "--output" && argv[i + 1]) {
      options.output = argv[++i]!;
    } else if (arg === "--width" && argv[i + 1]) {
      options.width = parseInt(argv[++i]!, 10);
    } else if (arg === "--height" && argv[i + 1]) {
      options.height = parseInt(argv[++i]!, 10);
    } else if (arg === "--gradient-start" && argv[i + 1]) {
      options.gradientStart = argv[++i]!;
    } else if (arg === "--gradient-end" && argv[i + 1]) {
      options.gradientEnd = argv[++i]!;
    } else if (arg === "--text-color" && argv[i + 1]) {
      options.textColor = argv[++i]!;
    }
  }

  if (!options.title) {
    console.error("Error: --title is required");
    process.exit(1);
  }

  if (!options.output) {
    console.error("Error: --output is required");
    process.exit(1);
  }

  return options;
}

function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  // Simple text wrapping logic
  const words = text.split('');
  const lines: string[] = [];
  let currentLine = '';

  // Estimate characters per line (rough calculation)
  const charsPerLine = Math.floor(maxWidth / (fontSize * 0.6));

  for (let i = 0; i < words.length; i++) {
    if (currentLine.length < charsPerLine) {
      currentLine += words[i];
    } else {
      lines.push(currentLine);
      currentLine = words[i]!;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  // Limit to 3 lines
  return lines.slice(0, 3);
}

async function generateCoverWithCanvas(options: CoverOptions): Promise<void> {
  try {
    // Try to import @napi-rs/canvas
    const { createCanvas } = await import("@napi-rs/canvas");

    const canvas = createCanvas(options.width!, options.height!);
    const ctx = canvas.getContext("2d");

    // Create gradient background
    const gradient = ctx.createLinearGradient(0, 0, options.width!, options.height!);
    gradient.addColorStop(0, options.gradientStart!);
    gradient.addColorStop(1, options.gradientEnd!);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, options.width!, options.height!);

    // Add text
    ctx.fillStyle = options.textColor!;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Wrap title text
    const fontSize = 48;
    const lines = wrapText(options.title, options.width! * 0.8, fontSize);

    ctx.font = `bold ${fontSize}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;

    const centerY = options.height! / 2;
    const lineHeight = fontSize * 1.2;
    const totalHeight = lines.length * lineHeight;
    const startY = centerY - totalHeight / 2;

    lines.forEach((line, index) => {
      ctx.fillText(line, options.width! / 2, startY + index * lineHeight + lineHeight / 2);
    });

    // Save image
    const outputPath = path.resolve(options.output);
    const ext = path.extname(outputPath).toLowerCase();

    let buffer: Buffer;
    if (ext === ".png") {
      buffer = canvas.toBuffer("image/png");
    } else {
      buffer = canvas.toBuffer("image/jpeg", 0.9);
    }

    fs.writeFileSync(outputPath, buffer);
    console.log(JSON.stringify({
      success: true,
      output: outputPath,
      size: `${options.width}x${options.height}`,
    }));

  } catch (error) {
    throw new Error(`Canvas generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function generateCoverWithSVG(options: CoverOptions): Promise<void> {
  // Fallback: Generate SVG and convert to PNG using sharp
  const svg = `
<svg width="${options.width}" height="${options.height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${options.gradientStart};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${options.gradientEnd};stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#grad)"/>
  <text x="50%" y="50%" font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
        font-size="48" font-weight="bold" fill="${options.textColor}"
        text-anchor="middle" dominant-baseline="middle">
    ${options.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
  </text>
</svg>
`.trim();

  try {
    // Try to use sharp for SVG to PNG conversion
    const sharp = await import("sharp");

    const outputPath = path.resolve(options.output);
    await sharp.default(Buffer.from(svg))
      .resize(options.width, options.height)
      .jpeg({ quality: 90 })
      .toFile(outputPath);

    console.log(JSON.stringify({
      success: true,
      output: outputPath,
      size: `${options.width}x${options.height}`,
      method: "sharp+svg"
    }));

  } catch (error) {
    throw new Error(`Sharp generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function generateCoverFallback(options: CoverOptions): Promise<void> {
  // Simple SVG-only fallback (no conversion to raster)
  const lines = wrapText(options.title, options.width! * 0.8, 48);
  const lineHeight = 60;
  const totalHeight = lines.length * lineHeight;
  const startY = (options.height! - totalHeight) / 2;

  const textElements = lines.map((line, index) => {
    const y = startY + index * lineHeight + lineHeight / 2;
    return `<text x="50%" y="${y}" font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
              font-size="48" font-weight="bold" fill="${options.textColor}"
              text-anchor="middle" dominant-baseline="middle">${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>`;
  }).join('\n  ');

  const svg = `
<svg width="${options.width}" height="${options.height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${options.gradientStart};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${options.gradientEnd};stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#grad)"/>
  ${textElements}
</svg>
`.trim();

  const outputPath = path.resolve(options.output);
  fs.writeFileSync(outputPath, svg);

  console.error(`Warning: Installed packages not found. Generated SVG file instead.`);
  console.error(`To generate PNG/JPEG, install one of:`);
  console.error(`  - npm install @napi-rs/canvas`);
  console.error(`  - npm install sharp`);

  console.log(JSON.stringify({
    success: true,
    output: outputPath,
    size: `${options.width}x${options.height}`,
    method: "svg-only",
    warning: "SVG file created. Install @napi-rs/canvas or sharp for raster image output."
  }));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  console.error(`[generate-cover] Generating cover image...`);
  console.error(`[generate-cover] Title: ${options.title}`);
  console.error(`[generate-cover] Size: ${options.width}x${options.height}`);
  console.error(`[generate-cover] Output: ${options.output}`);

  // Try methods in order: canvas > sharp > svg-only
  try {
    await generateCoverWithCanvas(options);
  } catch (canvasError) {
    console.error(`[generate-cover] Canvas method failed, trying sharp...`);
    try {
      await generateCoverWithSVG(options);
    } catch (sharpError) {
      console.error(`[generate-cover] Sharp method failed, using SVG fallback...`);
      await generateCoverFallback(options);
    }
  }
}

await main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
