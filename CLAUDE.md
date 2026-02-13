# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Denizci Sınav** — A Turkish-language amateur sailing/boating exam prep quiz app (Amatör Denizci Belgesi). Static single-page application with no build system, bundler, or package manager. All UI is rendered via JavaScript string templates into `#app`.

## Architecture

**No build step.** Open `index.html` directly or serve with any static file server. There are only 4 source files:

- `index.html` — Minimal shell, loads `style.css` and `app.js`
- `app.js` — Entire application logic (~600 lines): routing, rendering, state management, Firebase sync
- `style.css` — Dark-themed responsive styling (mobile-first, max-width 600px)
- `questions.json` — Question bank (221 questions across 10 sections)

### Rendering Pattern

The app uses a manual SPA pattern with no framework. `render(screen)` dispatches to screen-specific render functions (`renderLogin`, `renderDash`, `renderQuiz`, `renderSecResult`) that return HTML strings set via `innerHTML`. Navigation between screens is done by calling `render('screenName')`.

### State Management

- **Global mutable state**: `CUR_SEC`, `CUR_IDX`, `CUR_QS`, `SECS`, `SEC_QS`, `ALL_QUESTIONS`
- **Persistence**: Dual-layer — localStorage (`denizci_quiz` key) for offline, Firebase Realtime Database for cloud sync
- **User data shape**: `{ answers: { [questionId]: selectedOptionIndex }, completed: { [sectionName]: true } }`
- **Merge strategy**: On login, cloud data is fetched and merged with local (local answers win over cloud for conflicts)

### Firebase Cloud Sync

Uses Firebase Realtime Database REST API (no SDK). The `DB_URL` constant at the top of `app.js` points to the live database. Question IDs are prefixed with "q" before cloud storage to prevent Firebase from converting numeric-keyed objects into arrays.

### Question Data Format

Each question in `questions.json`:
```json
{
  "id": number,
  "section": "section name string",
  "question": "question text",
  "options": ["A", "B", "C", "D"],
  "correct": 0-3,
  "explanation": "explanation text"
}
```

Sections are derived at runtime from unique `section` values in the question array. The `correct` field is a zero-based index into `options`.

## Development

```bash
# Serve locally (any static server works)
python3 -m http.server 8000
# Then open http://localhost:8000
```

No tests, linter, or build commands exist. Changes are validated by manual browser testing.

## Key Conventions

- All UI text is in Turkish
- HTML is escaped via `esc()` (textContent-based) and `escAttr()` for attribute contexts
- CSS uses a dark navy color scheme (`#0a1628` background, `#60a5fa` accent)
- Score thresholds: green ≥70%, yellow ≥50%, red <50%
