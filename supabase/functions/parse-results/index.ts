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

    const detectedSource = detectSource(url);
    let results: ParsedResult[];

    if (detectedSource === "teeone") {
      results = await parseTeeoneViaAPI(url, format);
    } else {
      // For other sources, fetch HTML and try generic parse
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
      const html = await response.text();
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
 * Parse Teeone results by:
 * 1. Fetching the livescoring page to extract hidden field values (API token, tournament ID, etc.)
 * 2. Calling the Teeone API directly to get structured JSON results
 */
async function parseTeeoneViaAPI(url: string, format?: string): Promise<ParsedResult[]> {
  // Step 1: Fetch the page to get hidden fields
  const pageResponse = await fetch(url);
  if (!pageResponse.ok) throw new Error(`Failed to fetch Teeone page: ${pageResponse.status}`);
  const html = await pageResponse.text();

  // Extract hidden field values
  const getHidden = (name: string): string => {
    const match = html.match(new RegExp(`${name}"\\s*value="([^"]*)"`));
    return match ? match[1] : "";
  };

  const apiDomain = getHidden("HidAPIDominio");
  const token = getHidden("HidTokenAPI");
  const idInicioSesion = getHidden("HidInicioSesion");
  const idVendedor = getHidden("HidVendedor");
  const codTorneo = getHidden("HidTorneo");
  const culture = getHidden("HidCultura") || "es-ES";

  if (!apiDomain || !token || !codTorneo) {
    throw new Error("No s'han pogut extreure els paràmetres de l'API de Teeone. Comprova la URL.");
  }

  // Step 2: Get available rounds
  const vueltasRes = await fetch(`${apiDomain}/api/LiveScoring/ObtenerVueltasLive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ culture, token, idInicioSesion, idVendedor, codTorneo }),
  });
  const vueltasData = await vueltasRes.json();
  const vueltas: number[] = vueltasData.cod === 1 ? vueltasData.listaVueltas : [1];
  const lastVuelta = vueltas[vueltas.length - 1] || 1;

  // idTipoClasificacion: 1=Bruto Medal, 2=Neto Medal, 3=Bruto Stableford, 4=Neto Stableford
  const isStableford = !format || format === "stableford";
  const idTipoClasificacion = isStableford ? "4" : "1";

  // Step 3: Get classification positions
  const classRes = await fetch(`${apiDomain}/api/LiveScoring/ObtenerPosicionesClasificacionLive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      culture,
      token,
      idInicioSesion,
      idVendedor,
      codTorneo,
      numVuelta: String(lastVuelta),
      idTipoClasificacion,
      codSexo: "T",
      hcpDesde: "-10",
      hcpHasta: "54",
      hcpDesempate: false,
      codNivel: "T",
    }),
  });

  const classData = await classRes.json();
  if (classData.cod !== 1 || !classData.listaPosiciones) {
    throw new Error(classData.msg || "Error obtenint classificació de Teeone");
  }

  const results: ParsedResult[] = [];
  for (const p of classData.listaPosiciones) {
    const pos = parseInt(p.pos) || p.posReal || 0;
    if (!p.nombre || p.nombre.trim().length < 2) continue;

    const scores: number[] = [];
    if (p.r1 && parseInt(p.r1) > 0) scores.push(parseInt(p.r1));
    if (p.r2 && parseInt(p.r2) > 0) scores.push(parseInt(p.r2));
    if (p.r3 && parseInt(p.r3) > 0) scores.push(parseInt(p.r3));
    if (p.r4 && parseInt(p.r4) > 0) scores.push(parseInt(p.r4));

    const total = parseInt(p.tot) || null;
    const handicap = p.hex ? parseFloat(String(p.hex).replace(",", ".")) : null;

    results.push({
      position: pos,
      name: p.nombre.trim(),
      license: p.licencia || "",
      gender: p.codSexo === "F" ? "F" : p.codSexo === "M" ? "M" : "",
      handicap: isNaN(handicap as number) ? null : handicap,
      stableford_points: isStableford ? total : null,
      scratch_score: !isStableford ? total : null,
      scores,
      source_url: url,
    });
  }

  return results;
}

/**
 * Generic table parser fallback for HTML pages
 */
function parseGenericTable(html: string, sourceUrl: string): ParsedResult[] {
  const results: ParsedResult[] = [];
  const clean = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

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
    const rowCount = (content.match(/<tr/g) || []).length;
    score += Math.min(rowCount, 10);
    if (score > bestScore) { bestScore = score; bestTable = tableMatch[1]; }
  }

  if (!bestTable) return results;

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
