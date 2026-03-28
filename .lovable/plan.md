

## Plan: Extract hole data (par + handicap) from PDF/photo and use hole handicap for Stableford

### What changes

Currently, the system only extracts **par** per hole (18 values) from a URL. The user wants to:
1. Also extract the **hole handicap (stroke index)** for each hole — needed to correctly calculate Stableford points based on player handicap
2. Allow uploading a **PDF or photo** of the course scorecard (not just a URL)
3. Store both `course_par` and `course_handicap` (stroke index) per round

### Database

**Modify `rounds` table** — add a new column:
```sql
ALTER TABLE rounds ADD COLUMN course_handicap jsonb DEFAULT NULL;
```
This stores an array of 18 integers representing the stroke index for each hole (e.g., `[5, 13, 1, 17, 3, 15, 7, 11, 9, 6, 14, 2, 18, 4, 16, 8, 12, 10]`).

### Edge Function: `extract-course-par`

Update to:
- Accept **either** `{ url: "..." }` or `{ image: "data:image/...;base64,..." }` (base64-encoded PDF/photo)
- For URL: fetch HTML as before
- For image/PDF: pass the base64 image directly to the AI model using multimodal input
- Update AI prompt to extract **3 values per hole**: hole number, par, and handicap (stroke index)
- Update the tool schema to also return `handicap: number[]` (array of 18 stroke index values)
- Return both `par` and `handicap` arrays

### Admin UI: `AdminRounds.tsx`

Update the "Par del camp" section in the create/edit dialog:
- Add a **file upload input** (accept `.pdf,.jpg,.png,.jpeg,.webp`) alongside the existing URL input
- Two buttons: "Extreure des d'URL" (existing) and "Extreure des de fitxer" (new)
- When a file is selected, read it as base64 and send to the edge function
- Display both **par** and **handicap** fields (comma-separated, editable)
- Add a new form field `course_handicap` to store stroke index values
- Save both `course_par` and `course_handicap` to the database

### Scorecard Visual: `ScorecardVisual.tsx`

- Add optional `handicap` prop to show stroke index row on the scorecard

### Stableford Calculation

The hole handicap data will be available in `rounds.course_handicap` for future use in:
- Verifying/calculating Stableford points per hole based on player handicap
- Displaying stroke index on scorecards

### Files to modify
1. **Database migration** — add `course_handicap` column to `rounds`
2. **`supabase/functions/extract-course-par/index.ts`** — support image/PDF input + extract handicap
3. **`src/pages/admin/AdminRounds.tsx`** — file upload UI + handicap field
4. **`src/components/ScorecardVisual.tsx`** — show stroke index row

