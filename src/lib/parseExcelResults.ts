import * as XLSX from 'xlsx';

export interface ExcelParsedResult {
  position: number;
  name: string;
  license: string;
  gender: string;
  age: number | null;
  handicap_exact: number | null;
  handicap_play: number | null;
  category: number | null;
  stableford_points: number | null;
  scratch_score: number | null;
  scores: (number | null)[];
  is_np: boolean;
}

// Normalize header text for matching
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Map of semantic field → possible header names (normalized)
const HEADER_ALIASES: Record<string, string[]> = {
  pos:      ['pos', 'posicion', 'posicio', 'position', 'clas', 'clasificacion'],
  name:     ['nombre', 'nom', 'jugador', 'jugadora', 'player', 'name'],
  license:  ['licencia', 'llicencia', 'lic', 'license', 'nlic', 'nlicencia'],
  hex:      ['hex', 'hexacto', 'handicapexacto', 'hcpexacto', 'hcpex'],
  nvh:      ['nvh', 'hj', 'handicapjuego'],
  age:      ['edad', 'edat', 'age'],
  gender:   ['sex', 'sexo', 'genero', 'genre', 'gen', 'g'],
  category: ['cat', 'categoria', 'category'],
  hpu:      ['hpu', 'hcpjuego', 'handicapjuego', 'hcpu'],
  total:    ['total', 'stableford', 'stb', 'puntos', 'points', 'net'],
  scratch:  ['totalx', 'brt', 'bruto', 'gross', 'scratch', 'totalgolpes'],
  team:     ['equipo', 'equip', 'team'],
};

interface ColumnMap {
  pos: number | null;
  name: number | null;
  license: number | null;
  hex: number | null;
  nvh: number | null;
  age: number | null;
  gender: number | null;
  category: number | null;
  hpu: number | null;
  total: number | null;
  scratch: number | null;
  holeColumns: number[]; // indices for holes 1-18
}

function detectColumns(ws: XLSX.WorkSheet, headerRow: number, range: XLSX.Range): ColumnMap {
  const map: ColumnMap = {
    pos: null, name: null, license: null, hex: null, nvh: null,
    age: null, gender: null, category: null, hpu: null, total: null,
    scratch: null, holeColumns: [],
  };

  const headers: { col: number; raw: string; normalized: string }[] = [];

  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
    if (!cell || cell.v == null) continue;
    const raw = String(cell.v).trim();
    const normalized = norm(raw);
    headers.push({ col: c, raw, normalized });
  }

  // Match semantic fields
  for (const h of headers) {
    // Check if it's a hole number (1-18)
    const holeNum = parseInt(h.raw, 10);
    if (!isNaN(holeNum) && holeNum >= 1 && holeNum <= 18) {
      map.holeColumns.push(h.col);
      continue;
    }

    // Match against aliases
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (field === 'team') continue; // skip, we don't need it
      if (aliases.includes(h.normalized)) {
        (map as Record<string, number | null | number[]>)[field] = h.col;
        break;
      }
    }
  }

  // Sort hole columns by their header number
  map.holeColumns.sort((a, b) => {
    const aCell = ws[XLSX.utils.encode_cell({ r: headerRow, c: a })];
    const bCell = ws[XLSX.utils.encode_cell({ r: headerRow, c: b })];
    return parseInt(String(aCell?.v || '0')) - parseInt(String(bCell?.v || '0'));
  });

  return map;
}

function findHeaderRow(ws: XLSX.WorkSheet, range: XLSX.Range): number {
  // Look in first 5 rows for a row containing recognizable headers
  for (let r = range.s.r; r <= Math.min(range.s.r + 4, range.e.r); r++) {
    let matchCount = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell || cell.v == null) continue;
      const n = norm(String(cell.v).trim());
      // Check if this looks like a known header
      for (const aliases of Object.values(HEADER_ALIASES)) {
        if (aliases.includes(n)) { matchCount++; break; }
      }
      // Also count hole numbers
      const num = parseInt(String(cell.v), 10);
      if (!isNaN(num) && num >= 1 && num <= 18) matchCount++;
    }
    if (matchCount >= 3) return r;
  }
  return 0; // default to first row
}

export function parseExcelResults(buffer: ArrayBuffer): ExcelParsedResult[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('No s\'ha trobat cap fulla al fitxer Excel');

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const headerRow = findHeaderRow(ws, range);
  const cols = detectColumns(ws, headerRow, range);

  if (!cols.name) {
    throw new Error('No s\'ha trobat la columna de nom al fitxer Excel');
  }

  const results: ExcelParsedResult[] = [];
  let posCounter = 0;

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const getVal = (c: number | null) => {
      if (c === null) return null;
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      return cell ? cell.v : null;
    };

    const getNum = (c: number | null): number | null => {
      const v = getVal(c);
      if (v == null || v === '' || v === 'N.P' || v === '-') return null;
      const s = String(v).replace(',', '.');
      const n = parseFloat(s);
      return isNaN(n) ? null : n;
    };

    const nameVal = getVal(cols.name!);
    if (!nameVal) continue;
    const name = String(nameVal).trim();
    if (!name) continue;

    // Detect N.P. — check total or scratch columns
    const totalRaw = getVal(cols.total);
    const scratchRaw = getVal(cols.scratch);
    const isNP = totalRaw === 'N.P' || totalRaw === 'NP' || scratchRaw === 'N.P' || scratchRaw === 'NP';

    posCounter++;

    if (isNP) {
      results.push({
        position: posCounter,
        name,
        license: String(getVal(cols.license) || ''),
        gender: String(getVal(cols.gender) || ''),
        age: getNum(cols.age) != null ? Math.floor(getNum(cols.age)!) : null,
        handicap_exact: getNum(cols.hex),
        handicap_play: getNum(cols.hpu),
        category: getNum(cols.category) != null ? Math.floor(getNum(cols.category)!) : null,
        stableford_points: null,
        scratch_score: null,
        scores: [],
        is_np: true,
      });
      continue;
    }

    const posRaw = getNum(cols.pos);
    const position = posRaw ? Math.floor(posRaw) : posCounter;

    // Parse hole scores
    const scores: (number | null)[] = [];
    for (const hc of cols.holeColumns) {
      scores.push(getNum(hc));
    }

    const hasLiftedBall = scores.length > 0 && scores.some(s => s === null);

    // Determine stableford points: prefer 'total'/'net' column
    const stablefordRaw = getNum(cols.total);
    // Determine scratch: prefer 'scratch'/'brt' column, fallback to sum of holes
    let scratchScore = getNum(cols.scratch);
    if (scratchScore != null) scratchScore = Math.floor(scratchScore);

    results.push({
      position,
      name,
      license: String(getVal(cols.license) || ''),
      gender: String(getVal(cols.gender) || ''),
      age: getNum(cols.age) != null ? Math.floor(getNum(cols.age)!) : null,
      handicap_exact: getNum(cols.hex),
      handicap_play: getNum(cols.hpu),
      category: getNum(cols.category) != null ? Math.floor(getNum(cols.category)!) : null,
      stableford_points: stablefordRaw != null ? Math.floor(stablefordRaw) : null,
      scratch_score: hasLiftedBall ? null : (scratchScore ?? null),
      scores,
      is_np: false,
    });
  }

  return results;
}
