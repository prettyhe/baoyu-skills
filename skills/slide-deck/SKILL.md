---
name: slide-deck
description: Generate professional slide deck images from content. Creates comprehensive outlines with style instructions, then generates individual slide images. Use when user asks to "create slides", "make a presentation", "generate deck", or "slide deck".
---

# Slide Deck Generator

Transform content into professional slide deck with comprehensive outlines and generated slide images.

## Usage

```bash
# From markdown file
/slide-deck path/to/article.md

# With style preference
/slide-deck path/to/article.md --style corporate
/slide-deck path/to/article.md --style playful
/slide-deck path/to/article.md --style technical

# With audience specification
/slide-deck path/to/article.md --audience beginners
/slide-deck path/to/article.md --audience executives

# With language
/slide-deck path/to/article.md --lang zh
/slide-deck path/to/article.md --lang en

# Outline only (no image generation)
/slide-deck path/to/article.md --outline-only

# Direct content input
/slide-deck
[paste content]
```

## Options

| Option | Description |
|--------|-------------|
| `--style <name>` | Visual style preset (see Style Gallery) |
| `--audience <type>` | Target audience level |
| `--lang <code>` | Output language (en, zh, etc.) |
| `--slides <number>` | Target slide count (max 20) |
| `--outline-only` | Generate outline only, skip image generation |

## Style Gallery

### 1. `editorial` (Default)
Clean, sophisticated, minimalist
- **Aesthetic**: High-end journal, architectural blueprints
- **Colors**: Off-white background (#F8F7F5), dark slate text (#2F3542), blue accents (#007AFF)
- **Best for**: Thought leadership, research presentations

### 2. `corporate`
Professional, trustworthy, polished
- **Aesthetic**: Clean lines, structured layouts, business-appropriate
- **Colors**: Navy (#1E3A5F), white, gold accents (#C9A227)
- **Best for**: Business presentations, investor decks, reports

### 3. `technical`
Precise, data-driven, analytical
- **Aesthetic**: Blueprint style, schematic diagrams, grid layouts
- **Colors**: Dark charcoal (#1A1A2E), cyan accents (#00D4FF), light gray text (#E8E8E8)
- **Best for**: Technical documentation, engineering presentations

### 4. `playful`
Bold, energetic, engaging
- **Aesthetic**: Dynamic shapes, vibrant colors, creative layouts
- **Colors**: Warm white (#FFFDF7), deep purple (#4A1D96), coral (#FF6B6B)
- **Best for**: Creative pitches, educational content, workshops

### 5. `minimal`
Ultra-clean, zen-like, focused
- **Aesthetic**: Maximum whitespace, single focal points, elegant typography
- **Colors**: Black, white, single accent color
- **Best for**: Keynotes, philosophical content, product launches

### 6. `storytelling`
Narrative-driven, cinematic, immersive
- **Aesthetic**: Full-bleed imagery, dramatic typography, chapter-like flow
- **Colors**: Rich charcoal (#2D2D2D), warm white (#FAF9F6), gold (#D4AF37)
- **Best for**: Case studies, journey narratives, brand stories

## Audience Presets

| Audience | Approach |
|----------|----------|
| `beginners` | Step-by-step, more context, simpler visuals |
| `intermediate` | Balanced detail, some assumed knowledge |
| `experts` | Dense information, technical depth, less hand-holding |
| `executives` | High-level insights, key metrics, strategic focus |
| `general` | Accessible language, broad appeal, clear takeaways |

## File Management

### With Article Path

```
path/to/
├── article.md
└── slide-deck/
    ├── outline.md
    ├── prompts/
    │   ├── 01-cover.md
    │   ├── 02-content-1.md
    │   └── ...
    ├── 01-cover.png
    ├── 02-content-1.png
    └── ...
```

### Without Article Path

```
./slide-deck-outputs/YYYY-MM-DD/[topic-slug]/
├── outline.md
├── prompts/
│   ├── 01-cover.md
│   └── ...
├── 01-cover.png
└── ...
```

## Workflow

### Step 1: Analyze Content & Select Style

1. Read source content
2. If `--style` specified, use that style
3. Otherwise, analyze content for style signals:

| Content Signals | Selected Style |
|----------------|----------------|
| AI, coding, tech, digital, algorithm, data | `technical` |
| Business, strategy, investment, corporate | `corporate` |
| Personal story, journey, narrative, emotion | `storytelling` |
| Simple, zen, focus, essential, one idea | `minimal` |
| Fun, creative, workshop, educational | `playful` |
| Research, analysis, thought leadership | `editorial` |

4. Extract key information:
   - Core narrative and key messages
   - Important data points and statistics
   - Logical flow and structure
   - Target audience signals

### Step 2: Generate Outline

Create outline with `STYLE_INSTRUCTIONS` block and slide specifications.

**Outline Format**:

```markdown
# Slide Deck Outline: [Topic]

**Source**: [source file or "Direct input"]
**Style**: [selected style]
**Audience**: [target audience]
**Language**: [output language]
**Slide Count**: N slides
**Generated**: YYYY-MM-DD HH:mm

---

<STYLE_INSTRUCTIONS>
Design Aesthetic: [Overall style description]
Background Color: [Description and Hex Code]
Primary Font: [Font name for Headlines]
Secondary Font: [Font name for Body copy]
Color Palette:
  Primary Text Color: [Hex Code]
  Primary Accent Color: [Hex Code]
Visual Elements: [Lines, shapes, imagery style, etc.]
</STYLE_INSTRUCTIONS>

---

## Slide 1: [Descriptive Title]

**Position**: Cover
**Filename**: 01-cover.png

// NARRATIVE GOAL
[Storytelling purpose within the overall arc]

// KEY CONTENT
Headline: [Main message - narrative, not "Title: Subtitle" format]
Sub-headline: [Supporting context]
Body:
- [Key point 1 with specific data from source]
- [Key point 2 with specific data from source]

// VISUAL
[Detailed description of imagery, charts, graphics, or abstract visuals]

// LAYOUT
[Composition, hierarchy, spatial arrangement, focus points]

---

## Slide 2: [First Content]
...

## Slide N: [Back Cover]
...
```

**Required Slide Structure**:
1. **Slide 1**: Cover Slide (poster-style, heroic typography)
2. **Slides 2-N-1**: Content slides (consistent internal style)
3. **Slide N**: Back Cover (closing statement, not "Thank You")

### Step 3: Save Outline

Save outline as `outline.md` in target directory.

If `--outline-only` flag is set, stop here.

### Step 4: Create Prompt Files

For each slide, create a style-specific prompt file.

**Prompt Format**:

```markdown
Slide theme: [slide title]
Style: [style name]
Position: [cover/content/back-cover]

Visual composition:
- Main visual: [style-appropriate description from VISUAL section]
- Layout: [from LAYOUT section]
- Decorative elements: [style-specific decorations]

Color scheme:
- Background: [style background color]
- Primary text: [style text color]
- Accent: [style accent color]

Text content:
- Headline: [headline text]
- Sub-headline: [sub-headline if any]
- Body points: [bullet points if any]

Style notes: [specific style characteristics to emphasize]
```

### Step 5: Generate Images

For each slide, generate using:

```bash
/gemini-web --promptfiles [SKILL_ROOT]/skills/slide-deck/prompts/system.md [TARGET_DIR]/prompts/01-cover.md --image [TARGET_DIR]/01-cover.png
```

Generation flow:
1. Generate images sequentially
2. After each image, output progress: "Generated X/N"
3. On failure, auto-retry once
4. If retry fails, log reason, continue to next

### Step 6: Completion Report

```
Slide Deck Generated!

Topic: [topic]
Style: [style name]
Audience: [audience]
Location: [directory path]
Slides: N total

- 01-cover.png ✓ Cover
- 02-content-1.png ✓ Content
- 03-content-2.png ✓ Content
- ...
- 0N-back-cover.png ✓ Back Cover

Outline: outline.md

[If any failures]
Failed:
- 0X-slide-name.png: [failure reason]
```

## Style Reference Details

### editorial
```
Design Aesthetic: Clean, sophisticated, minimalist editorial inspired by architectural blueprints and high-end technical journals
Background Color: Subtle textured off-white #F8F7F5
Primary Font: Neue Haas Grotesk Display Pro (bold headlines)
Secondary Font: Tiempos Text (body copy, annotations)
Primary Text Color: Dark slate grey #2F3542
Primary Accent Color: Intelligent blue #007AFF
Visual Elements: Thin precise line work, schematic diagrams, clean vectors, spacious layouts
```

### corporate
```
Design Aesthetic: Professional, trustworthy, structured business presentation
Background Color: Clean white #FFFFFF with navy accents
Primary Font: Inter (headlines)
Secondary Font: Source Sans Pro (body)
Primary Text Color: Navy #1E3A5F
Primary Accent Color: Gold #C9A227
Visual Elements: Clean charts, professional icons, structured grids, subtle shadows
```

### technical
```
Design Aesthetic: Blueprint-style, precise, data-driven analytical presentation
Background Color: Dark charcoal #1A1A2E
Primary Font: JetBrains Mono (headlines)
Secondary Font: IBM Plex Sans (body)
Primary Text Color: Light gray #E8E8E8
Primary Accent Color: Cyan #00D4FF
Visual Elements: Grid overlays, circuit patterns, data visualizations, monospace code blocks
```

### playful
```
Design Aesthetic: Bold, energetic, creative with dynamic visual interest
Background Color: Warm white #FFFDF7
Primary Font: Poppins (headlines)
Secondary Font: Nunito (body)
Primary Text Color: Deep purple #4A1D96
Primary Accent Color: Vibrant coral #FF6B6B
Visual Elements: Rounded shapes, gradients, illustrations, dynamic compositions, bright pops
```

### minimal
```
Design Aesthetic: Ultra-clean, zen-like focus with elegant restraint
Background Color: Pure white #FFFFFF
Primary Font: Helvetica Neue (headlines)
Secondary Font: Garamond (body)
Primary Text Color: Pure black #000000
Primary Accent Color: Single accent (content-derived)
Visual Elements: Maximum whitespace, single focal points, hairline rules, elegant typography
```

### storytelling
```
Design Aesthetic: Cinematic, narrative-driven with immersive visual flow
Background Color: Rich charcoal #2D2D2D or full-bleed imagery
Primary Font: Playfair Display (headlines)
Secondary Font: Lora (body)
Primary Text Color: Warm white #FAF9F6
Primary Accent Color: Warm gold #D4AF37
Visual Elements: Full-bleed photos, dramatic typography, chapter markers, emotional imagery
```

## Notes

### Design Philosophy
- Deck is designed for **reading and sharing**, not live presentation
- Structure should be self-explanatory without a presenter
- Include enough context for visuals to be understood standalone
- Err on the side of audience having **more expertise** than expected

### Content Rules
- Maximum 20 slides per deck
- Every data point must trace to source material
- All details in prompts - image generator has no access to source

### Style Rules
- Avoid AI-generated clichés ("It wasn't just X, it was Y")
- Use narrative headlines, not "Title: Subtitle" format
- Cover and Back Cover should be visually distinct (poster-style)
- Back Cover should be meaningful closure, not "Thank You" or "Questions?"

### Prohibited
- Never include photorealistic images of prominent individuals
- Never include placeholder slides for author name, date, etc.

### Image Generation
- Image generation typically takes 10-30 seconds per slide
- Auto-retry once on generation failure
- Use cartoon alternatives for sensitive public figures
- Output language matches content language
- Maintain style consistency across all slides
