import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RankingResultRow = {
  id: string;
  round_id: string;
  player_id: string;
  handicap_at_round: number | null;
  stableford_points: number | null;
  scratch_score: number | null;
  category: string | null;
  is_female_prize: boolean;
  is_senior_prize: boolean;
  scorecard: unknown;
  play_date: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
  players_public: {
    name: string;
    license: string | null;
    gender: string | null;
    is_senior: boolean;
    current_handicap: number | null;
  } | null;
  rounds: {
    is_master: boolean;
    master_coefficient: number;
    name: string;
    round_number: number;
  } | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await adminClient
      .from("results")
      .select(`
        id,
        round_id,
        player_id,
        handicap_at_round,
        stableford_points,
        scratch_score,
        category,
        is_female_prize,
        is_senior_prize,
        scorecard,
        play_date,
        source_url,
        created_at,
        updated_at,
        rounds!inner(is_master, master_coefficient, name, round_number, status),
        players!inner(name, license, gender, is_senior, current_handicap)
      `)
      .eq("rounds.status", "published")
      .not("stableford_points", "is", null);

    if (error) throw error;

    const results: RankingResultRow[] = (data || []).map((row: any) => ({
      id: row.id,
      round_id: row.round_id,
      player_id: row.player_id,
      handicap_at_round: row.handicap_at_round,
      stableford_points: row.stableford_points,
      scratch_score: row.scratch_score,
      category: row.category,
      is_female_prize: row.is_female_prize,
      is_senior_prize: row.is_senior_prize,
      scorecard: row.scorecard,
      play_date: row.play_date,
      source_url: row.source_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
      rounds: row.rounds
        ? {
            is_master: row.rounds.is_master,
            master_coefficient: Number(row.rounds.master_coefficient ?? 1),
            name: row.rounds.name,
            round_number: row.rounds.round_number,
          }
        : null,
      players_public: row.players
        ? {
            name: row.players.name,
            license: row.players.license,
            gender: row.players.gender,
            is_senior: row.players.is_senior,
            current_handicap: row.players.current_handicap,
          }
        : null,
    }));

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});