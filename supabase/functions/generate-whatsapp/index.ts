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

    const prompt = `Genera un missatge de WhatsApp en ${langLabel} per compartir els RESULTATS d'una jornada de golf del circuit Gastronòmic Golf Experience.

El missatge ha de ser concís, directe i fàcil de llegir al mòbil. Estructura:

⛳ *GASTRONÒMIC GOLF EXPERIENCE*
*${round.name}* — J${round.round_number}
📍 ${round.club || ""} ${round.course ? `· ${round.course}` : ""}
📅 ${round.date}

🏆 *RESULTATS*

*Hàndicap Baix (≤15)*
🥇 [Nom] — [Punts] pts
🥈 [Nom] — [Punts] pts
🥉 [Nom] — [Punts] pts

*Hàndicap Alt (15.1–36)*
🥇 [Nom] — [Punts] pts
🥈 [Nom] — [Punts] pts
🥉 [Nom] — [Punts] pts

[Si aplica: Premi Femení i Sènior]

[Si hi ha actuacions destacades, 1 línia]

👥 ${results.length} participants

[Frase curta de tancament]

DADES:
CLASSIFICACIÓ HANDICAP BAIX:
${hcpLow.slice(0, 3).map((r: any, i: number) => `${i + 1}. ${r.players?.name} — ${r.stableford_points} pts`).join("\n")}

CLASSIFICACIÓ HANDICAP ALT:
${hcpHigh.slice(0, 3).map((r: any, i: number) => `${i + 1}. ${r.players?.name} — ${r.stableford_points} pts`).join("\n")}

${females.length > 0 ? `PREMI FEMENÍ: ${females[0]?.players?.name} — ${females[0]?.stableford_points} pts` : ""}
${seniors.length > 0 ? `PREMI SÈNIOR: ${seniors[0]?.players?.name} — ${seniors[0]?.stableford_points} pts` : ""}

${round.sponsor ? `Patrocinador: ${round.sponsor}` : ""}
${round.is_master ? "JORNADA MASTER (x1.25)" : ""}
Temporada: ${season?.year || "N/A"}

INSTRUCCIONS:
- Utilitza *negretes* de WhatsApp (amb asteriscs)
- Emojis moderats, menys que Instagram
- Molt concís i directe
- Modalitat STABLEFORD, NO mencionar scratch
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
          { role: "system", content: "Ets un community manager de golf. Generes missatges de WhatsApp concisos i clars amb format de negretes (*text*)." },
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
