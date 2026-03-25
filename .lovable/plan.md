

# Gastronomic Golf — Classificació Web App

## Overview
A bilingual (Catalan/Spanish) web extension for tracking the Gastronomic Golf 2026 private circuit: rankings, rounds, player profiles, comparisons, stats, news generation, and a full admin backoffice.

---

## Phase 1: Foundation & Data Model

### Backend Setup (Lovable Cloud / Supabase)
- **Seasons table** — id, year, rules config (JSON), active flag
- **Rounds (Jornades)** table — season_id, date, club/course, sponsor, status (draft/imported/review/validated/published), master flag (coef 1.25), multi-day support
- **Players (Jugadors)** table — license (unique identifier), name, photo_url, club, initial_handicap, current_handicap
- **Results** table — round_id, player_id, handicap_at_round, stableford_points, scratch_score, category (hcp_low/hcp_high/scratch/female/senior), scorecard (JSON hole-by-hole), source_url
- **Import logs** table — round_id, source, warnings, skipped records, timestamp
- **News drafts** table — round_id, language, tone, title, subtitle, body, highlights, seo_excerpt, status
- **Photos** table — round_id, type (winners/gallery), url, caption, category
- **Admin users** — via Supabase Auth with admin role table
- **RLS policies** — public read on all content tables, admin-only write

### Internationalization (i18n)
- Catalan as default language, Spanish as secondary
- Language switcher in navbar (CAT / ES)
- All UI labels, filters, microcopy translated
- Use react-i18next with JSON translation files

---

## Phase 2: Public Site — Layout & Navigation

### Design System
- Premium, elegant aesthetic aligned with Gastronomic Golf brand
- Clean typography, generous spacing, high contrast tables
- Mobile-first responsive design
- Color palette: dark greens, golds, warm neutrals — refined "gastronomic" feel

### Navigation Structure
1. **Visió general** (Overview/Home)
2. **Rànquings** (Rankings)
3. **Jornades** (Rounds)
4. **Jugadors** (Players)
5. **Comparador** (Compare)
6. **Estadístiques** (Stats)
7. **Notícies** (News)
8. Season selector + Language switcher (CAT/ES)

---

## Phase 3: Public Pages

### Home — Visió General
- Season summary hero with next/last round highlight
- Top ranked players cards
- Quick access CTAs to rankings, comparator, stats
- Latest news card
- Sponsor visibility

### Rànquings (Rankings)
- General classification table by season
- Category tabs: Handicap Baix, Handicap Alt, Scratch, Femenina, Senior
- Filters by round, category, season
- Columns: position, license, name, per-round scores, total, variation
- Export buttons: PDF, Excel/CSV, share link, image for WhatsApp

### Jornades (Rounds)
- Calendar list view of all rounds
- Round detail page:
  - Date, club/course, sponsor, links
  - Results by category, scratch, female, senior
  - Hole-by-hole scorecards (expandable per player)
  - Photo gallery
  - News summary
  - Multi-day round handling (best result counts)

### Jugadors (Players)
- Player directory with search
- Player profile card:
  - Photo, name, license, club
  - Initial handicap & latest handicap
  - Results per round (table)
  - Performance evolution chart
  - Birdies/pars/bogeys breakdown (when data available)
  - Notable holes
  - "Compare with..." button

### Comparador (Compare)
- Two-player selector (search by name/license)
- Side-by-side comparison:
  - Results per round
  - Averages (Stableford & scratch)
  - Positions
  - Regularity
  - Birdies, pars
  - Best round
  - Evolution chart overlay

### Estadístiques (Stats)
- Aggregated leaderboards:
  - Most birdies, most pars
  - Average Stableford, average scratch
  - Best round, regularity
  - Top 10 frequency
- Player comparison widget (same as Comparador)

### Notícies (News)
- List of round news articles
- Article detail with title, subtitle, body, highlights
- Share buttons

---

## Phase 4: Admin Backoffice

### Authentication
- Admin login (Supabase Auth)
- Admin management: create, edit, delete admin users

### Season Management
- Create new season
- Prompt: "Do rules change?" → if no, inherit previous config
- Configure calendar: dates, clubs, sponsors per round
- Mark one round as MASTER (1.25 coefficient)

### Round Management
- Create/edit rounds
- Status workflow: Draft → Imported → Review → Validated → Published
- Paste source URLs (GolfDirecto, Teeone, future sources)

### Import Engine
- Extensible adapter architecture (GolfDirecto adapter, Teeone adapter)
- Pre-import validation:
  - Tournament name match
  - Date/round match
  - Club/course match
  - Expected players match
  - Scorecard availability check
- Teeone: support for opening additional per-player URLs for full scorecards
- Import with warnings (non-blocking): show what wasn't imported and why
- Import log stored per round

### Classification Engine
- Stableford-based scoring
- Category fixed by first round played
- Best 8 of N scores count
- MASTER round × 1.25 coefficient
- Players can play same round on different days → best result only
- Tiebreak logic per published rules
- Scratch prize tracking
- Per-round prizes: female, senior
- Recalculate all on demand

### Photo Management
- Upload winner photos per category
- Upload gallery "beauty" photos
- Associate photos with rounds

### News Generation
- Before generating: confirm sponsor, allow special mention
- Generate one general round news article
- Two languages: Catalan + Spanish
- Two tones: journalistic-sports / friendly-close
- Auto-detect editorial highlights:
  - Category winners
  - Top classifieds
  - Hole-in-one
  - Most birdies
  - Notable hole-by-hole performance
- Output as editable draft:
  - Title, subtitle, body, highlights, SEO excerpt
- Export: copy to clipboard, download as document

### Exports
- PDF export of rankings/results
- Excel/CSV data export
- Shareable image generation (for WhatsApp/social)
- Public shareable links
- Exportable player cards/blocks

---

## Phase 5: Polish & Sharing

- Loading, empty, error states — well-designed
- Import warning states (incomplete import notice)
- "Not enough data" states
- Social share meta tags (OG)
- Responsive QA across mobile and desktop
- SEO-friendly URLs and metadata

---

## Technical Architecture Summary
- **Frontend**: React + Vite + Tailwind CSS + react-i18next
- **Backend**: Supabase (Lovable Cloud) — DB, Auth, Edge Functions, Storage
- **Import adapters**: Edge functions for scraping/parsing GolfDirecto & Teeone
- **News generation**: Edge function using Lovable AI
- **Export generation**: Client-side PDF (jsPDF), CSV, and canvas-to-image for social cards

