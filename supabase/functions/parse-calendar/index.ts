import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Month name mapping for Catalan
const monthMap: Record<string, string> = {
  gener: "01", febrer: "02", febret: "02", març: "03", abril: "04",
  maig: "05", juny: "06", juliol: "07", agost: "08",
  setembre: "09", octubre: "10", novembre: "11", desembre: "12",
};

interface ParsedRound {
  round_number: number;
  name: string;
  club: string;
  sponsor: string;
  dates: string[]; // ISO date strings
  detail_url: string;
  image_url: string;
}

function parseDates(text: string, year: number): string[] {
  const dates: string[] = [];

  // Match patterns like "Divendres 27 de febrer", "Dissabte 28 de març"
  const dateRegex =
    /(?:Dilluns|Dimarts|Dimecres|Dijous|Divendres|Dissabte|Diumenge)\s+(\d{1,2})\s+d[e']?\s*(\w+)/gi;
  let match;
  while ((match = dateRegex.exec(text)) !== null) {
    const day = match[1].padStart(2, "0");
    const monthName = match[2].toLowerCase();
    const month = monthMap[monthName];
    if (month) {
      dates.push(`${year}-${month}-${day}`);
    }
  }

  return dates;
}

function parseCalendarHtml(html: string): ParsedRound[] {
  const rounds: ParsedRound[] = [];

  // The calendar is structured as blocks with links containing round info
  // Pattern: Each round has an image link + a text link with club name, round number, and dates
  const blockRegex =
    /\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)\s*\n\s*\[([^\]]+)\]\(([^)]+)\)/g;

  // Alternative: parse the raw markdown structure
  // Split by round blocks - each starts with an image link
  const lines = html.split("\n");
  let currentRound: Partial<ParsedRound> | null = null;
  let roundNumber = 0;
  let textBlock = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect image link: [![...](image)](detail_url)
    const imgMatch = line.match(
      /\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)/
    );
    if (imgMatch) {
      // Save previous round if exists
      if (currentRound && textBlock) {
        finalizeRound(currentRound, textBlock, roundNumber, rounds);
        textBlock = "";
      }
      currentRound = {
        image_url: imgMatch[2],
        detail_url: imgMatch[3],
      };
      continue;
    }

    // Detect text link block: [**Club Name** **Sponsor** \\ Sortides Xª jornada ...](url)
    const textLinkMatch = line.match(/^\[(.+)\]\(([^)]+)\)$/);
    if (textLinkMatch && currentRound) {
      textBlock += " " + textLinkMatch[1];
      if (!currentRound.detail_url) {
        currentRound.detail_url = textLinkMatch[2];
      }
      continue;
    }

    // If we hit a section header, finalize last round
    if (line.startsWith("## ") && currentRound && textBlock) {
      finalizeRound(currentRound, textBlock, roundNumber, rounds);
      textBlock = "";
      currentRound = null;
    }
  }

  // Finalize last round
  if (currentRound && textBlock) {
    finalizeRound(currentRound, textBlock, roundNumber, rounds);
  }

  return rounds;

  function finalizeRound(
    partial: Partial<ParsedRound>,
    text: string,
    _rn: number,
    results: ParsedRound[]
  ) {
    // Extract round number
    const rnMatch = text.match(/(\d+)[ªº]\s*jornada/i);
    roundNumber = rnMatch ? parseInt(rnMatch[1]) : roundNumber + 1;

    // Extract club name (first bold text)
    const clubMatch = text.match(/\*\*([^*]+)\*\*/);
    const club = clubMatch ? clubMatch[1].trim() : "";

    // Extract sponsor (second bold text)
    const boldMatches = [...text.matchAll(/\*\*([^*]+)\*\*/g)];
    const sponsor = boldMatches.length > 1 ? boldMatches[1][1].trim() : "";

    // Clean text for name
    const cleanText = text.replace(/\*\*/g, "").replace(/\\/g, "").trim();

    // Parse dates
    const year = new Date().getFullYear();
    const dates = parseDates(text, year);

    results.push({
      round_number: roundNumber,
      name: club || `Jornada ${roundNumber}`,
      club,
      sponsor,
      dates,
      detail_url: partial.detail_url || "",
      image_url: partial.image_url || "",
    });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Fetching calendar from:", url);

    const response = await fetch(url);
    if (!response.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `Failed to fetch: ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = await response.text();

    // Convert HTML to a simpler format for parsing
    // Extract text content from the page
    // We'll work with the raw HTML to find round blocks
    const rounds = parseFromHtml(html);

    console.log(`Parsed ${rounds.length} rounds`);

    return new Response(
      JSON.stringify({ success: true, rounds }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function parseFromHtml(html: string): ParsedRound[] {
  const rounds: ParsedRound[] = [];
  const year = new Date().getFullYear();

  // Find blocks that contain "jornada" info
  // The site uses WordPress with specific structure
  // Look for links with round detail pages + text content

  // Strategy: find all anchor tags that contain "jornada" text
  // and extract club, dates, sponsor info

  // Extract all text blocks that mention "jornada"
  // Remove HTML tags but keep structure
  const textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;/g, "–")
    .replace(/\s+/g, " ");

  // Find image URLs from the HTML
  const imageUrls: string[] = [];
  const imgRegex = /src="([^"]*(?:212x300|poster)[^"]*)"/g;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    imageUrls.push(imgMatch[1]);
  }

  // Find detail URLs
  const detailUrls: string[] = [];
  const hrefRegex = /href="(https:\/\/gastronomicgolf\.com\/[^"]+)"/g;
  let hrefMatch;
  const seenUrls = new Set<string>();
  while ((hrefMatch = hrefRegex.exec(html)) !== null) {
    const u = hrefMatch[1];
    if (
      !u.includes("wp-content") &&
      !u.includes("festesoci") &&
      !seenUrls.has(u) &&
      u !== "https://gastronomicgolf.com/"
    ) {
      seenUrls.add(u);
      detailUrls.push(u);
    }
  }

  // Parse round blocks from text
  const jornadaRegex =
    /Sortides\s+(\d+)[ªº]?\s*jornada/gi;
  let jMatch;
  const jornadaPositions: { index: number; number: number }[] = [];
  while ((jMatch = jornadaRegex.exec(textContent)) !== null) {
    jornadaPositions.push({ index: jMatch.index, number: parseInt(jMatch[1]) });
  }

  for (let i = 0; i < jornadaPositions.length; i++) {
    const start = Math.max(0, jornadaPositions[i].index - 200);
    const end =
      i + 1 < jornadaPositions.length
        ? jornadaPositions[i + 1].index
        : jornadaPositions[i].index + 400;
    const block = textContent.substring(start, end);

    const roundNum = jornadaPositions[i].number;
    const dates = parseDates(block, year);

    // Try to find club name - typically appears before "Gastronòmic" or "Gastronomic"
    let club = "";
    let sponsor = "";
    
    const gastroMatch = block.match(
      /([A-ZÀ-ÚÇ][A-Za-zÀ-úçÉ\s&']+(?:Golf|Club|Country)[A-Za-zÀ-úçÉ\s&']*)/i
    );
    if (gastroMatch) {
      club = gastroMatch[1].trim();
    }

    const sponsorMatch = block.match(
      /Gastron[oò]mic\s+de\s+([A-Za-zÀ-úçÉ\s&']+?)(?:\s+Sortides|\s*$)/i
    );
    if (sponsorMatch) {
      sponsor = "Gastronòmic de " + sponsorMatch[1].trim();
    }

    rounds.push({
      round_number: roundNum,
      name: club || `Jornada ${roundNum}`,
      club: club,
      sponsor: sponsor,
      dates,
      detail_url: detailUrls[i] || "",
      image_url: imageUrls[i] || "",
    });
  }

  return rounds;
}
