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

export function parseExcelResults(buffer: ArrayBuffer): ExcelParsedResult[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('No s\'ha trobat cap fulla al fitxer Excel');

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const results: ExcelParsedResult[] = [];

  // Column mapping (0-indexed): A=0 Pos, B=1 Licencia, C=2 Nombre, D=3 Hex, E=4 NVH, F=5 Edad, G=6 Sex, H=7 Cat, I=8 Hpu, J=9 Total, K-AB=10-27 H1-H18, AC=28 Totalx
  let posCounter = 0;

  for (let r = 2; r <= range.e.r; r++) {
    const nameCell = ws[XLSX.utils.encode_cell({ r, c: 2 })];
    if (!nameCell || !nameCell.v) continue;

    const name = String(nameCell.v).trim();
    if (!name) continue;

    const getVal = (c: number) => {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      return cell ? cell.v : null;
    };

    const getNum = (c: number): number | null => {
      const v = getVal(c);
      if (v == null || v === '' || v === 'N.P' || v === '-') return null;
      const s = String(v).replace(',', '.');
      const n = parseFloat(s);
      return isNaN(n) ? null : n;
    };

    const totalRaw = getVal(9);
    const isNP = totalRaw === 'N.P' || totalRaw === 'NP';
    
    if (isNP) {
      posCounter++;
      results.push({
        position: posCounter,
        name,
        license: String(getVal(1) || ''),
        gender: String(getVal(6) || ''),
        age: getNum(5) ? Math.floor(getNum(5)!) : null,
        handicap_exact: getNum(3),
        handicap_play: getNum(8),
        category: getNum(7) ? Math.floor(getNum(7)!) : null,
        stableford_points: null,
        scratch_score: null,
        scores: [],
        is_np: true,
      });
      continue;
    }

    posCounter++;
    const posRaw = getNum(0);
    const position = posRaw ? Math.floor(posRaw) : posCounter;

    // Parse 18 hole scores (columns K=10 to AB=27)
    const scores: (number | null)[] = [];
    for (let h = 0; h < 18; h++) {
      scores.push(getNum(10 + h));
    }

    results.push({
      position,
      name,
      license: String(getVal(1) || ''),
      gender: String(getVal(6) || ''),
      age: getNum(5) ? Math.floor(getNum(5)!) : null,
      handicap_exact: getNum(3),
      handicap_play: getNum(8),
      category: getNum(7) ? Math.floor(getNum(7)!) : null,
      stableford_points: getNum(9) ? Math.floor(getNum(9)!) : null,
      scratch_score: getNum(28) ? Math.floor(getNum(28)!) : null,
      scores,
      is_np: false,
    });
  }

  return results;
}
