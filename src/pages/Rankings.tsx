import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import PlayerProfileDialog from '@/components/PlayerProfileDialog';
import { fetchPublicCircuitData, publicCircuitDataQueryKey, type PublicResult } from '@/lib/publicCircuitData';
import { buildPlayerCategoryHandicapMap, buildPlayerLastHandicapMap } from '@/lib/playerCategoryHandicap';
import { Trophy, ChevronRight, Users } from 'lucide-react';

type Result = PublicResult;

function computeScratchStableford(scorecard: any, coursePar: any): number | null {
  if (!scorecard?.scores || !coursePar) return null;
  const scores: (number | null)[] = scorecard.scores;
  const pars: number[] = coursePar;
  if (scores.length !== pars.length) return null;
  let total = 0;
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    if (s == null || s === 0) continue;
    total += Math.max(0, 2 - (s - pars[i]));
  }
  return total;
}

const Rankings = () => {
  const { t } = useTranslation();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('hcpLow');

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
    const categoryHcpMap = buildPlayerCategoryHandicapMap(results as any);
    const lastHcpMap = buildPlayerLastHandicapMap(results as any);

    const byPlayer = new Map<string, {
      name: string;
      gender: string | null;
      is_senior: boolean;
      handicap: number | null; // categoría (fijo)
      displayHandicap: number | null; // último jugado
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
          handicap: categoryHcpMap.get(pid) ?? r.players_public.current_handicap ?? r.handicap_at_round,
          displayHandicap: lastHcpMap.get(pid) ?? r.players_public.current_handicap ?? r.handicap_at_round,
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
          displayHandicap: p.displayHandicap,
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

    const scratchByPlayer = new Map<string, {
      name: string;
      handicap: number | null;
      displayHandicap: number | null;
      scratchScores: { points: number; roundId: string }[];
    }>();

    for (const r of results) {
      if (!r.players_public) continue;
      const pid = r.player_id;
      let scratchPts = computeScratchStableford(r.scorecard, r.rounds?.course_par);
      if (scratchPts == null && r.scratch_score != null && r.scratch_score <= 50) {
        scratchPts = r.scratch_score;
      }
      if (scratchPts == null) continue;
      if (!scratchByPlayer.has(pid)) {
        scratchByPlayer.set(pid, {
          name: r.players_public.name,
          handicap: r.players_public.current_handicap ?? r.handicap_at_round,
          displayHandicap: lastHcpMap.get(pid) ?? r.players_public.current_handicap ?? r.handicap_at_round,
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
        displayHandicap: p.displayHandicap,
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
    { key: 'scratch', label: 'Scratch' },
  ];

  const renderTable = (players: any[] | undefined) => {
    if (!players?.length) return <p className="text-muted-foreground text-sm py-8 text-center">{t('common.noData')}</p>;

    const hasManyRounds = (rounds?.length || 0) > 3;

    return (
      <div className="relative">
        {/* Fade indicador de scroll lateral en móvil */}
        {hasManyRounds && (
          <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-l from-card/80 to-transparent z-10 sm:hidden" />
        )}
        <div className="overflow-x-auto scroll-smooth -mx-2 px-2 [scrollbar-width:thin]">
          <table className="w-full text-sm border-separate border-spacing-0 min-w-[420px]">
            <thead>
              <tr className="text-[10px] text-muted-foreground/70 font-body font-medium tracking-[0.15em] uppercase">
                <th className="text-left py-3 pr-1.5 w-8 border-b border-border/30 sticky left-0 bg-card/95 backdrop-blur-sm z-[5]">Pos.</th>
                <th className="text-left py-3 pr-2 border-b border-border/30 sticky left-8 bg-card/95 backdrop-blur-sm z-[5]">
                  {t('common.name')} <span className="font-normal text-muted-foreground/50">(hcp)</span>
                </th>
                {rounds?.map((r) => (
                  <th key={r.id} className="text-right py-3 px-2 whitespace-nowrap border-b border-border/30 font-mono text-[10px]">
                    J{r.round_number}
                  </th>
                ))}
                <th className="text-right py-3 pl-3 pr-1 border-b border-border/30 border-l border-border/20">{t('common.total')}</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p: any, i: number) => {
                const position = i + 1;
                const isTop3 = position <= 3;
                const accentAlpha = position === 1 ? 0.14 : position === 2 ? 0.09 : position === 3 ? 0.05 : 0;
                const rowBg = isTop3
                  ? `linear-gradient(90deg, hsl(var(--accent) / ${accentAlpha}) 0%, hsl(var(--accent) / ${accentAlpha * 0.5}) 50%, hsl(var(--accent) / ${accentAlpha * 0.2}) 100%)`
                  : undefined;

                return (
                  <tr
                    key={p.id}
                    className="border-b border-border/20 last:border-0 hover:bg-muted/15 transition-colors group"
                  >
                    <td
                      className={`py-3 pr-1.5 text-sm font-body font-semibold sticky left-0 z-[4] ${isTop3 ? 'text-accent' : 'text-muted-foreground'}`}
                      style={{ background: rowBg || 'hsl(var(--card) / 0.95)', backdropFilter: 'blur(4px)' }}
                    >
                      {position}
                    </td>
                    <td
                      className="py-3 pr-2 sticky left-8 z-[4]"
                      style={{ background: rowBg || 'hsl(var(--card) / 0.95)', backdropFilter: 'blur(4px)' }}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedPlayerId(p.id)}
                        className="flex items-center gap-2 hover:text-accent transition-colors text-left"
                      >
                        <div className="h-5 w-5 rounded-full bg-muted/40 flex items-center justify-center shrink-0">
                          <Users className="h-2.5 w-2.5 text-muted-foreground/60" />
                        </div>
                        <span className="text-[13px] font-body font-medium text-foreground leading-tight">{p.name}</span>
                        {p.displayHandicap != null && (
                          <span className="text-[10px] text-muted-foreground/60 font-mono whitespace-nowrap">
                            ({Number(p.displayHandicap).toFixed(1)})
                          </span>
                        )}
                      </button>
                    </td>
                    {rounds?.map((r) => {
                      const score = p.roundScores.get(r.id);
                      const val = score?.weighted ?? score?.points;
                      return (
                        <td
                          key={r.id}
                          className="py-3 px-2 text-right font-mono text-xs"
                          style={{ background: rowBg }}
                        >
                          {val != null ? val : <span className="text-muted-foreground/30">—</span>}
                        </td>
                      );
                    })}
                    <td
                      className={`py-3 pl-3 pr-1 text-right font-mono font-bold text-sm border-l border-border/20 ${isTop3 ? 'text-accent' : 'text-foreground'}`}
                      style={{ background: rowBg }}
                    >
                      {p.total}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {hasManyRounds && (
          <p className="text-[9px] font-body text-muted-foreground/50 tracking-[0.2em] uppercase text-center mt-3 sm:hidden">
            ← Desplaça per veure més jornades →
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="animate-fade-in">
      {/* Header section matching Index style */}
      <section className="container pt-6 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <Trophy className="h-5 w-5 text-accent/70" strokeWidth={1.5} />
          <h1 className="font-display text-2xl font-semibold text-foreground">{t('rankings.title')}</h1>
        </div>
        <div className="flex items-center gap-2 mb-6">
          <p className="text-[11px] font-body text-muted-foreground tracking-wide">
            {t('rankings.generalClassification')} — {t('common.season')} 2026
          </p>
          <span className="inline-block text-[9px] px-2 py-0.5 border border-accent/30 text-accent/80 font-body font-medium tracking-[0.15em] uppercase">
            Millors {bestN} jornades
          </span>
        </div>

        {/* Category tabs matching Index editorial style */}
        <div className="flex items-center gap-4 mb-4">
          <div className="h-px flex-1 bg-border/60" />
          <span className="font-body text-[10px] font-medium tracking-[0.3em] uppercase text-muted-foreground">
            Categories
          </span>
          <div className="h-px flex-1 bg-border/60" />
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveTab(cat.key)}
              className={`px-4 py-2 text-[11px] font-body font-medium tracking-[0.15em] uppercase transition-all duration-300 border ${
                activeTab === cat.key
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-border/50 bg-card/30 text-muted-foreground hover:border-accent/20 hover:text-foreground'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </section>

      {/* Table section */}
      <section className="container pb-14">
        {isLoading ? (
          <p className="text-muted-foreground text-sm py-8 text-center">{t('common.loading')}</p>
        ) : (
          <div className="border border-border/50 bg-card/30">
            <div className="flex items-center justify-between px-7 py-5 border-b border-border/40">
              <h3 className="font-body text-[11px] font-medium tracking-[0.25em] uppercase text-foreground">
                {categories.find(c => c.key === activeTab)?.label}
              </h3>
            </div>
            <div className="px-7 py-2">
              {renderTable((rankings as any)[activeTab])}
            </div>
          </div>
        )}
      </section>

      <PlayerProfileDialog
        playerId={selectedPlayerId}
        open={!!selectedPlayerId}
        onOpenChange={(o) => !o && setSelectedPlayerId(null)}
      />
    </div>
  );
};

export default Rankings;