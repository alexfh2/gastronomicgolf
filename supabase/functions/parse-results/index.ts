import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ParsedResult {
  position: number;
  name: string;
  license: string;
  gender: string;
  handicap: number | null;
  stableford_points: number | null;
  scratch_score: number | null;
  scores: number[];
  source_url: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, format } = await req.json();
    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch(url);
    if (!response.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `Failed to fetch: ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = await response.text();
    const detectedSource = detectSource(url);
    let results: ParsedResult[];

    if (detectedSource === "teeone") {
      results = parseTeeone(html, url, format);
    } else {
      // Generic table parser fallback
      results = parseGenericTable(html, url);
    }

    return new Response(
      JSON.stringify({ success: true, source: detectedSource, results, count: results.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function detectSource(url: string): string {
  if (url.includes("teeone.golf") || url.includes("teeone.es")) return "teeone";
  if (url.includes("golfdirecto.com")) return "golfdirecto";
  return "generic";
}

/**
 * Parse Teeone livescoring HTML table.
 * Teeone renders a server-side <table> with columns like:
 * Pos | Jugador | Sexo | Hex | Hpu | TPar | Hoyo | Hoy | R1 | R2 | R3 | TOT
 * 
 * Player links contain license info: ?lic=CM01017629
 * The format param selects scoring type (stableford vs medal)
 */
function parseTeeone(html: string, sourceUrl: string, format?: string): ParsedResult[] {
  const results: ParsedResult[] = [];

  // Find the main results table
  const tableMatch = html.match(/<table[^>]*id="dataTableClasificacionesLive"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    // Try any table with results-like content
    return parseGenericTable(html, sourceUrl);
  }

  const tableHtml = tableMatch[1];

  // Extract header columns to understand structure
  const headerMatch = tableHtml.match(/<thead>([\s\S]*?)<\/thead>/i);
  const headers: string[] = [];
  if (headerMatch) {
    const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let th;
    while ((th = thRegex.exec(headerMatch[1])) !== null) {
      headers.push(stripHtml(th[1]).trim().toLowerCase());
    }
  }

  // Find column indices
  const posIdx = headers.findIndex(h => h === "pos" || h === "pos.");
  const nameIdx = headers.findIndex(h => h.includes("jugador") || h.includes("nombre") || h.includes("player"));
  const genderIdx = headers.findIndex(h => h === "sexo" || h === "sex");
  const hexIdx = headers.findIndex(h => h === "hex" || h.includes("hcp") || h.includes("handicap"));
  const totIdx = headers.findIndex(h => h === "tot" || h === "total");

  // Find round score columns (R1, R2, R3...)
  const roundIndices: number[] = [];
  headers.forEach((h, i) => {
    if (/^r\d+$/.test(h)) roundIndices.push(i);
  });

  // Parse body rows
  const tbodyMatch = tableHtml.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return results;

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row;
  while ((row = rowRegex.exec(tbodyMatch[1])) !== null) {
    const cells: string[] = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cell;
    while ((cell = cellRegex.exec(row[1])) !== null) {
      cells.push(cell[1]);
    }

    if (cells.length < 3) continue;

    // Extract position
    const pos = parseInt(stripHtml(cells[posIdx >= 0 ? posIdx : 0]));
    if (isNaN(pos)) continue;

    // Extract player name and license from link
    const nameCell = cells[nameIdx >= 0 ? nameIdx : 1];
    const name = stripHtml(nameCell).trim();
    const licMatch = nameCell.match(/lic=([A-Z0-9]+)/i);
    const license = licMatch ? licMatch[1] : "";

    // Gender
    const gender = genderIdx >= 0 ? stripHtml(cells[genderIdx]).trim() : "";

    // Handicap
    const hcpText = hexIdx >= 0 ? stripHtml(cells[hexIdx]).trim() : "";
    const handicap = hcpText ? parseFloat(hcpText.replace(",", ".")) : null;

    // Round scores
    const scores: number[] = [];
    for (const ri of roundIndices) {
      if (ri < cells.length) {
        const s = parseInt(stripHtml(cells[ri]).trim());
        if (!isNaN(s)) scores.push(s);
      }
    }

    // Total
    const totText = totIdx >= 0 && totIdx < cells.length ? stripHtml(cells[totIdx]).trim() : "";
    const total = totText ? parseInt(totText) : null;

    // Determine if this is stableford or medal based on format or URL
    const isStableford = format === "stableford" ||
      sourceUrl.includes("Stableford") ||
      (total !== null && total > 0 && total < 100);

    results.push({
      position: pos,
      name,
      license,
      gender: gender === "M" ? "M" : gender === "F" ? "F" : "",
      handicap: isNaN(handicap as number) ? null : handicap,
      stableford_points: isStableford ? total : null,
      scratch_score: !isStableford ? total : null,
      scores,
      source_url: sourceUrl,
    });
  }

  return results;
}

/**
 * Generic table parser - tries to find any HTML table with golf-like results
 */
function parseGenericTable(html: string, sourceUrl: string): ParsedResult[] {
  const results: ParsedResult[] = [];

  // Strip scripts/styles
  const clean = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Find tables
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let bestTable = "";
  let bestScore = 0;

  let tableMatch;
  while ((tableMatch = tableRegex.exec(clean)) !== null) {
    const content = tableMatch[1].toLowerCase();
    let score = 0;
    if (content.includes("jugador") || content.includes("player") || content.includes("nombre")) score += 5;
    if (content.includes("stableford") || content.includes("puntos")) score += 3;
    if (content.includes("handicap") || content.includes("hcp")) score += 3;
    if (content.includes("pos")) score += 2;
    // Count rows
    const rowCount = (content.match(/<tr/g) || []).length;
    score += Math.min(rowCount, 10);

    if (score > bestScore) {
      bestScore = score;
      bestTable = tableMatch[1];
    }
  }

  if (!bestTable) return results;

  // Parse the best table
  const headerMatch = bestTable.match(/<thead>([\s\S]*?)<\/thead>/i) ||
    bestTable.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);

  if (!headerMatch) return results;

  const headers: string[] = [];
  const thRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
  let th;
  while ((th = thRegex.exec(headerMatch[1])) !== null) {
    headers.push(stripHtml(th[1]).trim().toLowerCase());
  }

  const nameIdx = headers.findIndex(h =>
    h.includes("jugador") || h.includes("nombre") || h.includes("player") || h.includes("nom")
  );
  const ptsIdx = headers.findIndex(h =>
    h.includes("stableford") || h.includes("puntos") || h.includes("pts") || h.includes("points")
  );
  const hcpIdx = headers.findIndex(h =>
    h.includes("hcp") || h.includes("handicap") || h.includes("hex")
  );

  if (nameIdx < 0) return results;

  // Parse data rows (skip header row)
  const allRows = bestTable.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  let posCounter = 0;

  for (let i = 1; i < allRows.length; i++) {
    const cells: string[] = [];
    const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
    let cell;
    while ((cell = cellRegex.exec(allRows[i])) !== null) {
      cells.push(cell[1]);
    }

    if (cells.length < 2) continue;

    const name = stripHtml(cells[nameIdx]).trim();
    if (!name || name.length < 2) continue;

    posCounter++;

    const ptsText = ptsIdx >= 0 && ptsIdx < cells.length ? stripHtml(cells[ptsIdx]).trim() : "";
    const hcpText = hcpIdx >= 0 && hcpIdx < cells.length ? stripHtml(cells[hcpIdx]).trim() : "";

    results.push({
      position: posCounter,
      name,
      license: "",
      gender: "",
      handicap: hcpText ? parseFloat(hcpText.replace(",", ".")) : null,
      stableford_points: ptsText ? parseInt(ptsText) : null,
      scratch_score: null,
      scores: [],
      source_url: sourceUrl,
    });
  }

  return results;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
}
