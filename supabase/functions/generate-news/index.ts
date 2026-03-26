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

    // Build context for AI
    const topStableford = results.slice(0, 5);
    const topScratch = [...results].sort((a, b) => (a.scratch_score ?? 999) - (b.scratch_score ?? 999)).slice(0, 5);
    
    // Categorize results
    const hcpLow = results.filter((r: any) => r.category === 'hcp_low' || (r.handicap_at_round !== null && r.handicap_at_round <= 15));
    const hcpHigh = results.filter((r: any) => r.category === 'hcp_high' || (r.handicap_at_round !== null && r.handicap_at_round > 15));
    const females = results.filter((r: any) => r.is_female_prize);
    const seniors = results.filter((r: any) => r.is_senior_prize);

    // Check for notable scorecards
    const coursePar = round.course_par as number[] | null;
    let notablePerformances = '';
    if (coursePar && Array.isArray(coursePar)) {
      const totalPar = coursePar.reduce((a: number, b: number) => a + b, 0);
      results.forEach((r: any) => {
        if (r.scorecard && Array.isArray(r.scorecard)) {
          const birdies = r.scorecard.filter((s: number, i: number) => s < coursePar[i]).length;
          if (birdies >= 3) {
            notablePerformances += `${r.players?.name}: ${birdies} birdies. `;
          }
          const totalScore = r.scorecard.reduce((a: number, b: number) => a + b, 0);
          if (totalScore <= totalPar) {
            notablePerformances += `${r.players?.name}: sota par (${totalScore} vs ${totalPar}). `;
          }
        }
      });
    }

    const langLabel = language === 'ca' ? 'català' : 'castellà';
    const toneLabel = tone === 'journalistic' ? 'periodístic esportiu, professional' : 'proper, amigable, càlid';

    const prompt = `Genera una notícia esportiva de golf en ${langLabel} amb to ${toneLabel}.

DADES DE LA JORNADA:
- Jornada: ${round.name} (J${round.round_number})
- Temporada: ${season?.year || 'N/A'}
- Club: ${round.club || 'N/A'}
- Camp: ${round.course || 'N/A'}
- Data: ${round.date}
- Patrocinador: ${sponsor || 'cap'}
${special_mention ? `- Menció especial: ${special_mention}` : ''}

RESULTATS TOP 5 STABLEFORD:
${topStableford.map((r: any, i: number) => `${i + 1}. ${r.players?.name} — ${r.stableford_points} pts (Hcp ${r.handicap_at_round})`).join('\n')}

RESULTATS TOP 5 SCRATCH:
${topScratch.map((r: any, i: number) => `${i + 1}. ${r.players?.name} — ${r.scratch_score} cops`).join('\n')}

CLASSIFICACIÓ HCP BAIX (≤15): ${hcpLow.length} jugadors
${hcpLow.slice(0, 3).map((r: any, i: number) => `${i + 1}. ${r.players?.name} — ${r.stableford_points} pts`).join('\n')}

CLASSIFICACIÓ HCP ALT (>15): ${hcpHigh.length} jugadors  
${hcpHigh.slice(0, 3).map((r: any, i: number) => `${i + 1}. ${r.players?.name} — ${r.stableford_points} pts`).join('\n')}

${females.length > 0 ? `PREMI FEMENÍ: ${females.slice(0, 2).map((r: any) => r.players?.name).join(', ')}` : ''}
${seniors.length > 0 ? `PREMI SÈNIOR: ${seniors.slice(0, 2).map((r: any) => r.players?.name).join(', ')}` : ''}
${notablePerformances ? `ACTUACIONS DESTACADES: ${notablePerformances}` : ''}

Total participants: ${results.length}

INSTRUCCIONS:
- Genera un títol atractiu
- Un subtítol complementari
- Un cos de 3-5 paràgrafs
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
