import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import PlayerProfileDialog from '@/components/PlayerProfileDialog';
import { fetchPublicCircuitData, publicCircuitDataQueryKey, type PublicResult } from '@/lib/publicCircuitData';

type Result = PublicResult;

function computeScratchStableford(scorecard: any, coursePar: any): number | null {
  if (!scorecard?.scores || !coursePar) return null;
  const scores: (number | null)[] = scorecard.scores;
  const pars: number[] = coursePar;
  if (scores.length !== pars.length) return null;
  let total = 0;
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    if (s == null || s === 0) continue; // picked up = 0 scratch pts
    total += Math.max(0, 2 - (s - pars[i]));
  }
  return total;
}

const Rankings = () => {
  const { t } = useTranslation();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const { data: results, isLoading } = useQuery({
    queryKey: publicCircuitDataQueryKey,
    queryFn: fetchPublicCircuitData,
    select: (data) => data.results as Result[],
  });

  const { data: rounds } = useQuery({
    queryKey: ['public-published-rounds'],
    queryFn: async () => {
      const { data } = await supabase
        .from('rounds')
        .select('id, name, round_number')
        .eq('status', 'published')
        .order('round_number');
      return data || [];
    },
  });

  const { data: season } = useQuery({
    queryKey: ['public-season'],
    queryFn: async () => {
      const { data } = await supabase
        .from('seasons')
        .select('rules_config')
        .eq('active', true)
        .single();
      return data;
    },
  });

  const bestN = (season?.rules_config as any)?.best_n_scores || 8;

  const rankings = useMemo(() => {
    if (!results?.length || !rounds?.length) return {};

    const roundMap = new Map(rounds.map(r => [r.id, r]));

    // --- Stableford rankings ---
    const byPlayer = new Map<string, {
      name: string;
      gender: string | null;
      is_senior: boolean;
      handicap: number | null;
      scores: { points: number; roundId: string; roundNumber: number; roundName: string; isMaster: boolean; coef: number }[];
    }>();

    for (const r of results) {
      if (!r.players_public || r.stableford_points == null) continue;
      const pid = r.player_id;
      if (!byPlayer.has(pid)) {
        byPlayer.set(pid, {
          name: r.players_public.name,
          gender: r.players_public.gender,
          is_senior: r.players_public.is_senior,
          handicap: r.handicap_at_round ?? r.players_public.current_handicap,
          scores: [],
        });
      }
      const round = roundMap.get(r.round_id);
      byPlayer.get(pid)!.scores.push({
        points: r.stableford_points,
        roundId: r.round_id,
        roundNumber: round?.round_number || r.rounds?.round_number || 0,
        roundName: r.rounds?.name || '',
        isMaster: r.rounds?.is_master || false,
        coef: r.rounds?.master_coefficient || 1,
      });
      if (r.handicap_at_round != null && !byPlayer.get(pid)!.handicap) {
        byPlayer.get(pid)!.handicap = r.handicap_at_round;
      }
    }

    const buildRanking = (
      filterFn: (p: { gender: string | null; is_senior: boolean; handicap: number | null }) => boolean,
    ) => {
      const filtered = Array.from(byPlayer.entries()).filter(([, p]) => filterFn(p));

      return filtered.map(([id, p]) => {
        const roundScores = new Map<string, { points: number; weighted: number }>();
        for (const s of p.scores) {
          const weighted = Math.round(s.points * (s.isMaster ? s.coef : 1));
          roundScores.set(s.roundId, { points: s.points, weighted });
        }

        const allWeighted = p.scores.map(s => ({
          ...s,
          weighted: Math.round(s.points * (s.isMaster ? s.coef : 1)),
        }));
        allWeighted.sort((a, b) => b.weighted - a.weighted);
        const bestScores = allWeighted.slice(0, bestN);
        const total = bestScores.reduce((sum, s) => sum + s.weighted, 0);

        return {
          id,
          name: p.name,
          gender: p.gender,
          is_senior: p.is_senior,
          handicap: p.handicap,
          total,
          roundsPlayed: p.scores.length,
          roundScores,
        };
      });
    };

    const hcpLow = buildRanking(p => p.handicap != null && p.handicap <= 15.0);
    hcpLow.sort((a, b) => b.total - a.total);

    const hcpHigh = buildRanking(p => p.handicap != null && p.handicap > 15.0);
    hcpHigh.sort((a, b) => b.total - a.total);

    const female = buildRanking(p => p.gender === 'F');
    female.sort((a, b) => b.total - a.total);

    const senior = buildRanking(p => p.is_senior);
    senior.sort((a, b) => b.total - a.total);

    // --- Scratch ranking ---
    const scratchByPlayer = new Map<string, {
      name: string;
      handicap: number | null;
      scratchScores: { points: number; roundId: string }[];
    }>();

    for (const r of results) {
      if (!r.players_public) continue;
      const pid = r.player_id;

      // Compute scratch stableford from scorecard + course_par
      let scratchPts = computeScratchStableford(r.scorecard, r.rounds?.course_par);

      // Fallback: use scratch_score if it looks like scratch stableford (≤50)
      if (scratchPts == null && r.scratch_score != null && r.scratch_score <= 50) {
        scratchPts = r.scratch_score;
      }

      if (scratchPts == null) continue;

      if (!scratchByPlayer.has(pid)) {
        scratchByPlayer.set(pid, {
          name: r.players_public.name,
          handicap: r.handicap_at_round ?? r.players_public.current_handicap,
          scratchScores: [],
        });
      }
      scratchByPlayer.get(pid)!.scratchScores.push({ points: scratchPts, roundId: r.round_id });
    }

    const scratch = Array.from(scratchByPlayer.entries()).map(([id, p]) => {
      const roundScores = new Map<string, { points: number; weighted: number }>();
      for (const s of p.scratchScores) {
        roundScores.set(s.roundId, { points: s.points, weighted: s.points });
      }
      const sorted = [...p.scratchScores].sort((a, b) => b.points - a.points).slice(0, bestN);
      const total = sorted.reduce((sum, s) => sum + s.points, 0);
      return {
        id,
        name: p.name,
        gender: null,
        is_senior: false,
        handicap: p.handicap,
        total,
        roundsPlayed: p.scratchScores.length,
        roundScores,
      };
    });
    scratch.sort((a, b) => b.total - a.total);

    return { hcpLow, hcpHigh, female, senior, scratch };
  }, [results, rounds, bestN]);

  const categories = [
    { key: 'hcpLow', label: 'HCP Baix (≤15.0)' },
    { key: 'hcpHigh', label: 'HCP Alt (>15.0)' },
    { key: 'female', label: t('categories.female') },
    { key: 'senior', label: t('categories.senior') },
    { key: 'scratch', label: 'Scratch' },
  ];

  const renderTable = (players: any[] | undefined) => {
    if (!players?.length) return <p className="text-muted-foreground text-sm py-4">{t('common.noData')}</p>;

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 text-muted-foreground">
              <th className="text-left py-2.5 pr-2 w-12">{t('common.position')}</th>
              <th className="text-left py-2.5 font-light">{t('common.name')}</th>
              {rounds?.map(r => (
                <th key={r.id} className="text-right py-2.5 px-1.5 text-xs whitespace-nowrap">J{r.round_number}</th>
              ))}
              <th className="text-right py-2.5 font-bold">{t('common.total')}</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p: any, i: number) => (
              <tr
                key={p.id}
                className={`border-b border-border/20 last:border-0 hover:bg-muted/30 transition-colors ${i < 3 ? 'bg-accent/5' : ''}`}
              >
                <td className={`py-2 pr-2 font-mono font-bold ${i < 3 ? 'text-accent' : 'text-muted-foreground'}`}>
                  {i + 1}
                </td>
                <td className="py-2 font-medium">
                  <button
                    type="button"
                    onClick={() => setSelectedPlayerId(p.id)}
                    className="hover:text-primary transition-colors text-left"
                  >
                    {p.name}
                    {p.handicap != null && <span className="text-muted-foreground font-normal text-xs ml-1">({p.handicap})</span>}
                  </button>
                </td>
                {rounds?.map(r => {
                  const score = p.roundScores.get(r.id);
                  const val = score?.weighted ?? score?.points;
                  return (
                    <td key={r.id} className="py-2 px-1.5 text-right font-mono text-xs">
                      {val != null ? val : <span className="text-muted-foreground/40">—</span>}
                    </td>
                  );
                })}
                <td className="py-2 text-right font-mono font-bold text-lg text-primary">{p.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="container py-8 lg:py-12 animate-fade-in">
      <div className="bg-primary rounded-xl px-5 py-5 mb-8 shadow-md">
        <h1 className="font-display text-3xl font-bold text-primary-foreground">{t('rankings.title')}</h1>
        <p className="text-primary-foreground/70 mt-1">
          {t('rankings.generalClassification')} — {t('common.season')} 2026
          <Badge variant="outline" className="ml-2 text-[10px] tracking-wider uppercase border-primary-foreground/30 text-primary-foreground/80">Millors {bestN} jornades</Badge>
        </p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <Tabs defaultValue="hcpLow">
          <TabsList className="flex-wrap h-auto gap-1">
            {categories.map((cat) => (
              <TabsTrigger key={cat.key} value={cat.key} className="text-xs sm:text-sm">
                {cat.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {categories.map((cat) => (
            <TabsContent key={cat.key} value={cat.key}>
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{cat.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderTable((rankings as any)[cat.key])}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}

      <PlayerProfileDialog
        playerId={selectedPlayerId}
        open={!!selectedPlayerId}
        onOpenChange={(o) => !o && setSelectedPlayerId(null)}
      />
    </div>
  );
};

export default Rankings;
