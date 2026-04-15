import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { round_id, language, tone, sponsor, special_mention } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch round data
    const { data: round, error: roundError } = await supabase
      .from("rounds")
      .select("*")
      .eq("id", round_id)
      .single();
    if (roundError) throw roundError;

    // Fetch results with player info
    const { data: results, error: resultsError } = await supabase
      .from("results")
      .select("*, players(*)")
      .eq("round_id", round_id)
      .order("stableford_points", { ascending: false });
    if (resultsError) throw resultsError;

    // Fetch season
    const { data: season } = await supabase
      .from("seasons")
      .select("year")
      .eq("id", round.season_id)
      .single();

    // Build context for AI — Stableford only (no scratch)
    const topStableford = results.slice(0, 5);
    
    // Categorize results
    const hcpLow = results.filter((r: any) => r.category === 'hcp_low' || (r.handicap_at_round !== null && r.handicap_at_round <= 15));
    const hcpHigh = results.filter((r: any) => r.category === 'hcp_high' || (r.handicap_at_round !== null && r.handicap_at_round > 15));
    const females = results.filter((r: any) => r.is_female_prize || r.players?.gender === 'F');
    const seniors = results.filter((r: any) => r.is_senior_prize || r.players?.is_senior === true);

    // Sort each category by stableford
    hcpLow.sort((a: any, b: any) => (b.stableford_points ?? 0) - (a.stableford_points ?? 0));
    hcpHigh.sort((a: any, b: any) => (b.stableford_points ?? 0) - (a.stableford_points ?? 0));
    females.sort((a: any, b: any) => (b.stableford_points ?? 0) - (a.stableford_points ?? 0));
    seniors.sort((a: any, b: any) => (b.stableford_points ?? 0) - (a.stableford_points ?? 0));

    // Check for notable scorecards
    const coursePar = round.course_par as number[] | null;
    let notablePerformances = '';
    if (coursePar && Array.isArray(coursePar)) {
      results.forEach((r: any) => {
        if (r.scorecard && Array.isArray(r.scorecard)) {
          const birdies = r.scorecard.filter((s: number, i: number) => s < coursePar[i]).length;
          if (birdies >= 3) {
            notablePerformances += `${r.players?.name}: ${birdies} birdies. `;
          }
        }
      });
    }

    const langLabel = language === 'ca' ? 'català' : 'castellà';
    const toneLabel = tone === 'press' 
      ? 'nota de premsa esportiva, formal i professional' 
      : 'engrescador per xarxes socials (WhatsApp/Instagram), amb emojis i to proper';

    const prompt = `Genera una notícia esportiva de golf en ${langLabel} amb to de ${toneLabel}.
IMPORTANT: La competició és en modalitat STABLEFORD. NO mencionis resultats scratch ni cops totals. Tots els resultats són en punts Stableford.
El circuit és el "Gastronòmic Golf Experience" — un circuit de golf amb gastronomia i grans premis.

TEXT DE REFERÈNCIA D'ESTIL (adapta'l al golf i al Gastronòmic Golf Experience):
---
Després de [X] intenses jornades, la classificació s'està consolidant i ja es perfilen els jugadors que lluitaran pel podi aquesta temporada. 🏆

🏌️‍♂️ Hàndicap Baix: la batalla dels millors!
La competició no pot estar més ajustada. [Descripció engrescadora del líder i perseguidors]

🥇 [Nom] encapçala amb [X] pts, mostrant una regularitat impressionant.
🥈 Molt a prop, [Nom] amb [X] pts.
🥉 La tercera posició és per a [Nom] amb [X] pts.

TOP 10:
[Llistat]

👏 Hàndicap Alt: els qui millor dominen el camp!
[Mateixa estructura]

[Si hi ha actuacions destacades: birdies, hole-in-ones, etc.]

Per a més detalls i classificacions actualitzades, visiteu la nostra web.
Continuarem informant-vos de totes les novetats d'aquest emocionant circuit! A seguir gaudint del golf! 💪
---

DADES DE LA JORNADA:
- Jornada: ${round.name} (J${round.round_number})
- Temporada: ${season?.year || 'N/A'}
- Club: ${round.club || 'N/A'}
- Camp: ${round.course || 'N/A'}
- Data: ${round.date}
- Patrocinador: ${sponsor || 'cap'}
${round.is_master ? '- JORNADA MASTER (punts x1.25)' : ''}
${special_mention ? `- Menció especial: ${special_mention}` : ''}

CLASSIFICACIÓ HANDICAP BAIX (≤15.0) — ${hcpLow.length} jugadors:
${hcpLow.slice(0, 10).map((r: any, i: number) => `${i + 1}. ${r.players?.name} — ${r.stableford_points} pts (Hcp ${r.handicap_at_round})`).join('\n')}

CLASSIFICACIÓ HANDICAP ALT (15.1–36.0) — ${hcpHigh.length} jugadors:
${hcpHigh.slice(0, 10).map((r: any, i: number) => `${i + 1}. ${r.players?.name} — ${r.stableford_points} pts (Hcp ${r.handicap_at_round})`).join('\n')}

${females.length > 0 ? `CLASSIFICACIÓ FEMENINA — ${females.length} jugadores:\n${females.slice(0, 10).map((r: any, i: number) => `${i + 1}. ${r.players?.name} — ${r.stableford_points} pts (Hcp ${r.handicap_at_round})`).join('\n')}` : ''}
${seniors.length > 0 ? `CLASSIFICACIÓ SÈNIOR (+65) — ${seniors.length} jugadors:\n${seniors.slice(0, 10).map((r: any, i: number) => `${i + 1}. ${r.players?.name} — ${r.stableford_points} pts (Hcp ${r.handicap_at_round})`).join('\n')}` : ''}
${notablePerformances ? `ACTUACIONS DESTACADES: ${notablePerformances}` : ''}

Total participants: ${results.length}

INSTRUCCIONS:
- Segueix l'estructura del text de referència: introducció engrescadora, després cada categoria amb descripció + top 10 + emojis
- Destaca els guanyadors de cada categoria (Hcp Baix i Hcp Alt) amb comentaris personalitzats
- Si hi ha classificació femenina o sènior, dedica una secció completa a cada una amb la mateixa estructura (descripció engrescadora + top classificades/ats)
- NO mencionIs resultats scratch ni cops totals
- Si el to és "nota de premsa", NO utilitzis emojis i mantingues un to formal
- Si el to és "xarxes socials", utilitza emojis com al text de referència
- Genera un títol atractiu
- Un subtítol complementari
- Un cos complet amb la narració per categories
- 3-5 highlights (frases curtes de destacats)
- Un extracte SEO de màxim 160 caràcters

Retorna EXCLUSIVAMENT un JSON vàlid amb aquest format:
{
  "title": "...",
  "subtitle": "...",
  "body": "...",
  "highlights": ["...", "..."],
  "seo_excerpt": "..."
}`;

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Ets un redactor esportiu especialitzat en golf. Respon SEMPRE amb JSON vàlid, sense markdown." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI error: ${aiResponse.status} — ${errText}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    
    // Parse JSON from response (handle potential markdown wrapping)
    let cleaned = content.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    
    const news = JSON.parse(cleaned);

    return new Response(JSON.stringify({ success: true, news }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
