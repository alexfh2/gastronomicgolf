import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth: require admin role ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;
    const { data: isAdmin } = await supabaseAuth.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const parsedBody = z.object({
      round_id: z.string().uuid(),
      language: z.enum(["ca", "es"]),
      special_prizes: z.string().trim().max(2000).nullable().optional(),
    }).safeParse(await req.json());
    if (!parsedBody.success) {
      return new Response(JSON.stringify({ success: false, error: parsedBody.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { round_id, language, special_prizes } = parsedBody.data;

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

    // Build fixed category HCP map (first played round per player, season-wide)
    const { data: seasonRounds } = await supabase
      .from("rounds")
      .select("id, date, round_number, status")
      .eq("season_id", round.season_id);
    const consideredRoundIds = (seasonRounds || [])
      .filter((r: any) => r.status === "published" || r.id === round_id)
      .map((r: any) => r.id);
    const roundMeta = new Map<string, any>((seasonRounds || []).map((r: any) => [r.id, r]));
    const { data: allSeasonResults } = await supabase
      .from("results")
      .select("player_id, handicap_at_round, play_date, created_at, round_id, players(initial_handicap, current_handicap)")
      .in("round_id", consideredRoundIds.length ? consideredRoundIds : [round_id]);
    const sortKey = (r: any) => {
      const meta = roundMeta.get(r.round_id) || {};
      const d = r.play_date || meta.date || "";
      const n = String(meta.round_number ?? 9999).padStart(4, "0");
      const c = r.created_at || "";
      return `${d || "9999-99-99"}|${n}|${c}`;
    };
    const firstByPlayer = new Map<string, any>();
    for (const r of (allSeasonResults || [])) {
      if (r.handicap_at_round == null) continue;
      const prev = firstByPlayer.get(r.player_id);
      if (!prev || sortKey(r) < sortKey(prev)) firstByPlayer.set(r.player_id, r);
    }
    const categoryHcpMap = new Map<string, number | null>();
    for (const [pid, r] of firstByPlayer.entries()) categoryHcpMap.set(pid, r.handicap_at_round);
    for (const r of (allSeasonResults || [])) {
      if (categoryHcpMap.has(r.player_id)) continue;
      const p: any = r.players;
      categoryHcpMap.set(r.player_id, p?.initial_handicap ?? p?.current_handicap ?? null);
    }
    const getCatHcp = (r: any) =>
      categoryHcpMap.get(r.player_id) ?? r.handicap_at_round ?? r.players?.current_handicap ?? null;
    const getHcp = (r: any) => r.handicap_at_round ?? r.players?.current_handicap ?? null;
    // Stableford tiebreaker: lower HCP wins
    const sortByPointsThenLowHcp = (a: any, b: any) => {
      const diff = (b.stableford_points ?? 0) - (a.stableford_points ?? 0);
      if (diff !== 0) return diff;
      return (Number(getHcp(a)) || Infinity) - (Number(getHcp(b)) || Infinity);
    };
    const hcpLow = results
      .filter((r: any) => { const h = getCatHcp(r); return h != null && Number(h) <= 15.0; })
      .sort(sortByPointsThenLowHcp);
    const hcpHigh = results
      .filter((r: any) => { const h = getCatHcp(r); return h != null && Number(h) > 15.0; })
      .sort(sortByPointsThenLowHcp);
    const females = results
      .filter((r: any) => r.players?.gender === "F")
      .sort(sortByPointsThenLowHcp);
    const seniors = results
      .filter((r: any) => r.players?.is_senior === true)
      .sort(sortByPointsThenLowHcp);

    // Scratch: Stableford brut, igual que a la classificació pública. En empat, guanya l'HCP més alt.
    const coursePar = Array.isArray(round.course_par) ? round.course_par as number[] : null;
    const getScratchPoints = (r: any): number | null => {
      const scores = Array.isArray(r.scorecard)
        ? r.scorecard
        : Array.isArray(r.scorecard?.scores) ? r.scorecard.scores : null;
      if (!scores || !coursePar || scores.length !== coursePar.length) return null;
      return scores.reduce((total: number, score: number | null, index: number) => {
        if (score == null || score === 0) return total;
        return total + Math.max(0, 2 - (score - coursePar[index]));
      }, 0);
    };
    const scratch = results
      .map((r: any) => ({ ...r, scratch_points: getScratchPoints(r) }))
      .filter((r: any) => r.scratch_points != null)
      .sort((a: any, b: any) => {
        const diff = b.scratch_points - a.scratch_points;
        if (diff !== 0) return diff;
        return (getHcp(b) ?? -Infinity) - (getHcp(a) ?? -Infinity);
      });

    const langLabel = language === "ca" ? "català" : "castellà";
    const publishedUrl = "https://resultatsgastronomic.com";

    const prompt = `Genera un missatge de WhatsApp en ${langLabel} per compartir els RESULTATS d'una jornada de golf del circuit Gastronòmic Golf Experience.

IMPORTANT: La competició és en modalitat STABLEFORD. Inclou també la classificació Scratch, sempre expressada en PUNTS STABLEFORD SCRATCH, mai en cops totals.

TEXT DE REFERÈNCIA (adapta l'estil però amb dades Stableford):
---
Resultats ${round.name} — Temporada ${season?.year || "N/A"}

RESULTATS DE LA ${round.name} DEL GASTRONÒMIC GOLF EXPERIENCE ${season?.year || ""}

El ${round.club || "club"} ha acollit la ${round.name} del Gastronòmic Golf Experience, disputada el ${round.date}, amb la participació de ${results.length} jugadors.
${round.sponsor ? `Jornada patrocinada per ${round.sponsor}.` : ""}
${round.is_master ? "⭐ JORNADA MASTER — Punts x1.25!" : ""}
En la classificació Scratch, [NOM] s'ha imposat amb [X] punts Stableford Scratch, seguit de [NOM] ([X]) i [NOM] ([X]).

En la classificació Hàndicap Baix (≤15), [NOM] s'ha imposat amb [X] punts Stableford, seguit de [NOM] ([X]) i [NOM] ([X]).

En la classificació Hàndicap Alt (15.1–36), [NOM] s'ha imposat amb [X] punts, seguit de [NOM] ([X]) i [NOM] ([X]).
${females.length > 0 ? `\nEn la classificació Femenina, [NOM] s'ha imposat amb [X] punts.` : ""}
${seniors.length > 0 ? `\nEn la classificació Sènior (+65), [NOM] s'ha imposat amb [X] punts.` : ""}
---

DADES REALS:
${scratch.length > 0 ? `CLASSIFICACIÓ SCRATCH:\n${scratch.slice(0, 3).map((r: any, i: number) => `${i + 1}. ${r.players?.name} — ${r.scratch_points} pts Stableford Scratch (Hcp ${r.handicap_at_round})`).join("\n")}` : ""}

CLASSIFICACIÓ HANDICAP BAIX (≤15.0) — ${hcpLow.length} jugadors:
${hcpLow.slice(0, 3).map((r: any, i: number) => `${i + 1}. ${r.players?.name} — ${r.stableford_points} pts (Hcp ${r.handicap_at_round})`).join("\n")}

CLASSIFICACIÓ HANDICAP ALT (15.1–36.0) — ${hcpHigh.length} jugadors:
${hcpHigh.slice(0, 3).map((r: any, i: number) => `${i + 1}. ${r.players?.name} — ${r.stableford_points} pts (Hcp ${r.handicap_at_round})`).join("\n")}

${females.length > 0 ? `CLASSIFICACIÓ FEMENINA — Guanyadora:\n1. ${females[0].players?.name} — ${females[0].stableford_points} pts (Hcp ${females[0].handicap_at_round})` : ""}
${seniors.length > 0 ? `CLASSIFICACIÓ SÈNIOR (+65) — Guanyador:\n1. ${seniors[0].players?.name} — ${seniors[0].stableford_points} pts (Hcp ${seniors[0].handicap_at_round})` : ""}

Total participants: ${results.length}

INSTRUCCIONS:
- Segueix EXACTAMENT l'estructura del text de referència: títol, introducció, resultats per categories, premis especials si n'hi ha i web final
- Per a Hàndicap Baix, Hàndicap Alt i Scratch: inclou els 3 primers classificats
- Per a Femenina i Sènior: menciona NOMÉS el/la guanyador/a
- OBLIGATORI: després de la introducció, escriu cinc blocs consecutius i identificables, sense mencionar cap categoria abans del seu bloc: 1) Scratch, 2) Hàndicap Baix, 3) Hàndicap Alt, 4) Femenina, 5) Sènior
- IMPORTANT: Deixa una línia en blanc entre cada secció/categoria per facilitar la lectura
- Utilitza format *negretes* de WhatsApp per al títol i noms de categories
- To formal i informatiu, sense emojis excessius (només algun puntual si escau)
- A Scratch, indica SEMPRE punts Stableford Scratch, MAI cops totals
- No escriguis premis especials ni cap adreça web: el sistema els afegirà després de la classificació Sènior
- Retorna NOMÉS el text del missatge, sense JSON ni markdown`;

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": lovableApiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        reasoning_effort: "low",
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
    const prizesBlock = special_prizes ? `\n\n*Premis especials*\n${special_prizes}` : "";
    content = `${content}${prizesBlock}\n\n${publishedUrl}`;

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
