# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ghillie.xyz is a static personal portfolio website hosted on GitHub Pages. It showcases digital design work (YouTube thumbnails) and includes several interactive web tools.

## Development

**Local Development:** Use VS Code Live Server extension on port 5501 (configured in `.vscode/settings.json`).

**Deployment:** Push to `main` branch - GitHub Pages serves the site at ghillie.xyz (configured via `CNAME` file).

## Architecture

### Pages
- `/` - Home page with hero, "Worked With" section (featuring YouTube creators), and recent work carousel
- `/about/` - About page with bio
- `/portfolio/` - Thumbnail portfolio gallery with Masonry layout and modal viewer
- `/wordle/` - Wordle solver tool (client-side word filtering)
- `/kleptos/` - Video downloader with Google OAuth login (WIP, requires external backend)
- `/dbviewer/` - SQLite database viewer using sql.js (WIP, fully client-side)

### Shared Assets
- `/assets/css/main.css` - Global styles: navbar, footer, scrollbar, color variables (`--navbar-text-color`, `--navbar-hover-color`)
- `/assets/css/spinglow.css` + `/assets/js/spinglow_responsive.js` - Animated spinning glow effect for profile pictures
- `/assets/css/divider.css` - Section divider styling
- `/assets/css/special_carousel.css` + `/assets/js/special_carousel.js` - Custom carousel for recent work

### External Dependencies (CDN)
- Bootstrap 5.1.3 (home/about pages)
- Bootstrap 4.1.3 + jQuery 3.3.1 + Masonry (portfolio page)
- sql.js 1.7.0 + Chart.js (DB viewer)

### Key Patterns
- Each page has its own CSS file in `/assets/css/` matching the page name
- All pages share the same navbar structure with dropdown menu
- Footer links to GitHub, Discord, Twitter consistently across pages
- YouTube subscriber counts fetched via `api.socialcounts.org` through CORS proxy
