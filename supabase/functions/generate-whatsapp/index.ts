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
    const { round_id, language } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: round, error: roundError } = await supabase
      .from("rounds")
      .select("*")
      .eq("id", round_id)
      .single();
    if (roundError) throw roundError;

    const { data: results, error: resultsError } = await supabase
      .from("results")
      .select("*, players(*)")
      .eq("round_id", round_id)
      .order("stableford_points", { ascending: false });
    if (resultsError) throw resultsError;

    const { data: season } = await supabase
      .from("seasons")
      .select("year")
      .eq("id", round.season_id)
      .single();

    // Categorize results
    const hcpLow = results
      .filter((r: any) => r.category === "hcp_low" || (r.handicap_at_round !== null && r.handicap_at_round <= 15))
      .sort((a: any, b: any) => (b.stableford_points ?? 0) - (a.stableford_points ?? 0));
    const hcpHigh = results
      .filter((r: any) => r.category === "hcp_high" || (r.handicap_at_round !== null && r.handicap_at_round > 15))
      .sort((a: any, b: any) => (b.stableford_points ?? 0) - (a.stableford_points ?? 0));
    const females = results
      .filter((r: any) => r.is_female_prize)
      .sort((a: any, b: any) => (b.stableford_points ?? 0) - (a.stableford_points ?? 0));
    const seniors = results
      .filter((r: any) => r.is_senior_prize)
      .sort((a: any, b: any) => (b.stableford_points ?? 0) - (a.stableford_points ?? 0));

    const langLabel = language === "ca" ? "català" : "castellà";
    const publishedUrl = "https://verdant-stats.lovable.app/rankings";

    const prompt = `Genera un missatge de WhatsApp en ${langLabel} per compartir els RESULTATS d'una jornada de golf del circuit Gastronòmic Golf Experience.

IMPORTANT: La competició és en modalitat STABLEFORD. Tots els resultats són en PUNTS STABLEFORD, NO en cops. No mencionIs "cops" ni "scratch".

TEXT DE REFERÈNCIA (adapta l'estil però amb dades Stableford):
---
Resultats ${round.name} — Temporada ${season?.year || "N/A"}

RESULTATS DE LA ${round.name} DEL GASTRONÒMIC GOLF EXPERIENCE ${season?.year || ""}

El ${round.club || "club"} ha acollit la ${round.name} del Gastronòmic Golf Experience, disputada el ${round.date}, amb la participació de ${results.length} jugadors.
${round.sponsor ? `Jornada patrocinada per ${round.sponsor}.` : ""}
${round.is_master ? "⭐ JORNADA MASTER — Punts x1.25!" : ""}

En la classificació Hàndicap Baix (≤15), [NOM] s'ha imposat amb [X] punts Stableford, seguit de [NOM] ([X]) i [NOM] ([X]). En la classificació Hàndicap Alt (15.1–36), [NOM] s'ha imposat amb [X] punts, seguit de [NOM] ([X]) i [NOM] ([X]).${females.length > 0 ? " En la classificació Femenina, [NOM] s'ha imposat amb [X] punts, seguida de [NOM] ([X]) i [NOM] ([X])." : ""}${seniors.length > 0 ? " En la classificació Sènior (+65), [NOM] s'ha imposat amb [X] punts, seguit de [NOM] ([X]) i [NOM] ([X])." : ""}

Les classificacions completes i estadístiques detallades es poden consultar a: ${publishedUrl}
---

DADES REALS:
CLASSIFICACIÓ HANDICAP BAIX (≤15.0) — ${hcpLow.length} jugadors:
${hcpLow.slice(0, 3).map((r: any, i: number) => `${i + 1}. ${r.players?.name} — ${r.stableford_points} pts (Hcp ${r.handicap_at_round})`).join("\n")}

CLASSIFICACIÓ HANDICAP ALT (15.1–36.0) — ${hcpHigh.length} jugadors:
${hcpHigh.slice(0, 3).map((r: any, i: number) => `${i + 1}. ${r.players?.name} — ${r.stableford_points} pts (Hcp ${r.handicap_at_round})`).join("\n")}

${females.length > 0 ? `CLASSIFICACIÓ FEMENINA — ${females.length} jugadores:\n${females.slice(0, 3).map((r: any, i: number) => `${i + 1}. ${r.players?.name} — ${r.stableford_points} pts (Hcp ${r.handicap_at_round})`).join("\n")}` : ""}
${seniors.length > 0 ? `CLASSIFICACIÓ SÈNIOR (+65) — ${seniors.length} jugadors:\n${seniors.slice(0, 3).map((r: any, i: number) => `${i + 1}. ${r.players?.name} — ${r.stableford_points} pts (Hcp ${r.handicap_at_round})`).join("\n")}` : ""}

Total participants: ${results.length}

INSTRUCCIONS:
- Segueix EXACTAMENT l'estructura del text de referència: títol, introducció, resultats per categories en paràgraf narratiu, link final
- Inclou TOTES les categories que tinguin dades: Hcp Baix, Hcp Alt, Femenina i Sènior
- Utilitza format *negretes* de WhatsApp per al títol i noms de categories
- To formal i informatiu, sense emojis excessius (només algun puntual si escau)
- SEMPRE punts Stableford, MAI cops ni scratch
- Inclou el link a les classificacions al final: ${publishedUrl}
- Retorna NOMÉS el text del missatge, sense JSON ni markdown`;

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
          { role: "system", content: "Ets un redactor esportiu de golf. Generes missatges de WhatsApp clars, formals i concisos." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI error: ${aiResponse.status} — ${errText}`);
    }

    const aiData = await aiResponse.json();
    let content = aiData.choices?.[0]?.message?.content || "";
    content = content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/^```(?:\w+)?\n?/, "").replace(/\n?```$/, "");
    }

    return new Response(JSON.stringify({ success: true, message: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
