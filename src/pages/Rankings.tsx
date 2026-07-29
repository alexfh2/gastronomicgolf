import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import PlayerProfileDialog from '@/components/PlayerProfileDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchPublicCircuitData, publicCircuitDataQueryKey, type PublicResult } from '@/lib/publicCircuitData';
import { buildPlayerCategoryHandicapMap, buildPlayerLastHandicapMap } from '@/lib/playerCategoryHandicap';
import { Trophy, ChevronRight, Users, ChevronDown, User } from 'lucide-react';

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
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);

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
        const countedRoundIds = new Set(bestScores.map(s => s.roundId));

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
          countedRoundIds,
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
      const countedRoundIds = new Set(sorted.map(s => s.roundId));
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
        countedRoundIds,
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

    // Solid background per row. Top 3 use a fixed accent tint (no gradient) so sticky
    // columns and middle cells share the same color. Card base color is fully opaque
    // to prevent scrolled round numbers bleeding through sticky name/pos/total cells.
    const cardSolid = 'hsl(var(--card))';
    const top3Bg = (pos: number) => {
      if (pos === 1) return `color-mix(in srgb, hsl(var(--accent)) 14%, hsl(var(--card)))`;
      if (pos === 2) return `color-mix(in srgb, hsl(var(--accent)) 9%, hsl(var(--card)))`;
      if (pos === 3) return `color-mix(in srgb, hsl(var(--accent)) 5%, hsl(var(--card)))`;
      return cardSolid;
    };

    return (
      <>
        {/* ---------- MOBILE VIEW: lista compacta expandible ---------- */}
        <div className="sm:hidden">
          <ul className="divide-y divide-border/20">
            {players.map((p: any, i: number) => {
              const position = i + 1;
              const isTop3 = position <= 3;
              const rowBg = top3Bg(position);
              const isExpanded = expandedPlayerId === p.id;

              return (
                <li key={p.id} style={{ background: rowBg }}>
                  <button
                    type="button"
                    onClick={() => setExpandedPlayerId(isExpanded ? null : p.id)}
                    className="w-full grid items-center gap-x-2 min-h-[44px] py-2.5 px-1.5 text-left"
                    style={{ gridTemplateColumns: '28px minmax(0,1fr) 52px 20px' }}
                    aria-expanded={isExpanded}
                  >
                    <span
                      className={`font-body text-[13px] font-semibold tabular-nums ${isTop3 ? 'text-accent' : 'text-secondary-foreground'}`}
                    >
                      {position}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-body text-[14px] font-medium text-foreground leading-[1.25] line-clamp-2 break-words">
                        {p.name}
                      </span>
                      {p.displayHandicap != null && (
                        <span className="block text-[11.5px] leading-tight text-secondary-foreground font-body tabular-nums mt-0.5">
                          Hcp {Number(p.displayHandicap).toFixed(1)}
                        </span>
                      )}
                    </span>
                    <span
                      className={`text-right font-body font-semibold text-[16px] tabular-nums ${isTop3 ? 'text-accent' : 'text-foreground'}`}
                    >
                      {p.total}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 justify-self-end text-secondary-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {isExpanded && (
                    <div className="px-1.5 pb-3 pt-1 animate-fade-in">
                      <div className="grid grid-cols-5 gap-1.5 mb-3">

                        {rounds?.map((r) => {
                          const score = p.roundScores.get(r.id);
                          const val = score?.weighted ?? score?.points;
                          const isDropped = val != null && p.countedRoundIds && !p.countedRoundIds.has(r.id);
                          return (
                            <div
                              key={r.id}
                              className="flex flex-col items-center justify-center py-1.5 px-1 border border-border/30 bg-card/40"
                            >
                              <span className="font-body text-[10px] font-medium tracking-[0.05em] uppercase text-secondary-foreground">
                                J{r.round_number}
                              </span>
                              {val != null ? (
                                <span
                                  className={`font-body text-[13px] tabular-nums ${isDropped ? 'line-through opacity-70 text-destructive' : 'text-foreground'}`}
                                  title={isDropped ? 'No computa entre les 8 millors proves' : undefined}
                                >
                                  {val}
                                </span>
                              ) : (
                                <span className="font-body text-[13px] tabular-nums text-secondary-foreground/60">—</span>
                              )}
                            </div>
                          );
                        })}

                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPlayerId(p.id);
                        }}
                        className="w-full flex items-center justify-center gap-1.5 min-h-[44px] px-3 type-action-label text-accent border border-accent/40 hover:bg-accent/10 transition-colors"
                      >
                        <User className="h-3.5 w-3.5" strokeWidth={1.5} />
                        Veure perfil del jugador
                      </button>

                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* ---------- DESKTOP / TABLET VIEW: tabla completa ---------- */}
        <div className="hidden sm:block relative">
          <div className="overflow-x-auto scroll-smooth -mx-2 px-2 [scrollbar-width:thin]">
            <table className="w-full text-sm border-separate border-spacing-0 min-w-[420px]">
              <thead>
                <tr className="type-table-header">
                  <th className="text-left py-3 pr-1.5 w-8 border-b border-border/30 sticky left-0 z-[6]" style={{ background: cardSolid }}>Pos.</th>
                  <th className="text-left py-3 pr-2 border-b border-border/30 sticky left-8 z-[6]" style={{ background: cardSolid }}>
                    {t('common.name')} <span className="font-normal normal-case">(hcp)</span>
                  </th>
                  {rounds?.map((r) => (
                    <th key={r.id} className="text-right py-3 px-2 whitespace-nowrap border-b border-border/30 tabular-nums" style={{ background: cardSolid }}>
                      J{r.round_number}
                    </th>
                  ))}
                  <th className="text-right py-3 pl-3 pr-2 border-b border-border/30 border-l border-border/30 sticky right-0 z-[7] text-foreground" style={{ background: cardSolid, boxShadow: '-4px 0 6px -4px hsl(var(--background) / 0.6)' }}>{t('common.total')}</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p: any, i: number) => {
                  const position = i + 1;
                  const isTop3 = position <= 3;
                  const rowBg = top3Bg(position);

                  return (
                    <tr key={p.id} className="border-b border-border/20 last:border-0 group">
                      <td
                        className={`py-2.5 pr-1.5 font-body text-[14px] font-semibold tabular-nums sticky left-0 z-[4] ${isTop3 ? 'text-accent' : 'text-secondary-foreground'}`}
                        style={{ background: rowBg }}
                      >
                        {position}
                      </td>
                      <td className="py-2.5 pr-2 sticky left-8 z-[4]" style={{ background: rowBg }}>
                        <button
                          type="button"
                          onClick={() => setSelectedPlayerId(p.id)}
                          className="flex items-center gap-2 hover:text-accent transition-colors text-left"
                        >
                          <div className="h-5 w-5 rounded-full bg-muted/40 flex items-center justify-center shrink-0">
                            <Users className="h-2.5 w-2.5 text-secondary-foreground" />
                          </div>
                          <span className="text-[15px] font-body font-medium text-foreground leading-tight whitespace-nowrap">
                            {p.name}
                            {p.displayHandicap != null && (
                              <span className="ml-1 text-[13px] text-secondary-foreground font-body tabular-nums">
                                ({Number(p.displayHandicap).toFixed(1)})
                              </span>
                            )}
                          </span>
                        </button>
                      </td>
                      {rounds?.map((r) => {
                        const score = p.roundScores.get(r.id);
                        const val = score?.weighted ?? score?.points;
                        const isDropped = val != null && p.countedRoundIds && !p.countedRoundIds.has(r.id);
                        return (
                          <td
                            key={r.id}
                            className={`py-2.5 px-2 text-right font-body text-[14px] tabular-nums ${isDropped ? 'line-through opacity-70 text-destructive' : 'text-foreground'}`}
                            style={{ background: rowBg }}
                            title={isDropped ? 'No computa entre les 8 millors proves' : undefined}
                          >
                            {val != null ? val : <span className="text-secondary-foreground/60 no-underline">—</span>}
                          </td>
                        );
                      })}

                      <td
                        className={`py-2.5 pl-3 pr-2 text-right font-body font-semibold text-[17px] tabular-nums border-l border-border/30 sticky right-0 z-[5] ${isTop3 ? 'text-accent' : 'text-foreground'}`}
                        style={{ background: rowBg, boxShadow: '-4px 0 6px -4px hsl(var(--background) / 0.6)' }}
                      >
                        {p.total}
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="animate-fade-in">
      {/* Header section matching Index style */}
      <section className="container pt-6 pb-4">
        <div className="flex items-center gap-3 mb-1.5">
          <Trophy className="h-5 w-5 text-accent/70" strokeWidth={1.5} />
          <h1 className="type-page-title">{t('rankings.title')}</h1>
        </div>
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <p className="type-page-subtitle">
            {t('rankings.generalClassification')} — {t('common.season')} 2026
          </p>
          <span className="inline-block type-eyebrow px-2 py-0.5 border border-accent/40 text-accent">
            Millors {bestN} jornades
          </span>
        </div>

        {/* Category tabs matching Index editorial style */}
        <div className="flex items-center gap-4 mb-4">
          <div className="h-px flex-1 bg-border/60" />
          <span className="type-eyebrow">
            Categories
          </span>
          <div className="h-px flex-1 bg-border/60" />
        </div>

        {/* Mobile: dropdown */}
        <div className="sm:hidden mb-4">
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full min-h-[44px] type-action-label uppercase tracking-[0.06em] border-accent/40 bg-accent/5 text-accent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border z-50">
              {categories.map((cat) => (
                <SelectItem key={cat.key} value={cat.key} className="type-action-label uppercase tracking-[0.06em]">
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Desktop: tabs */}
        <div className="hidden sm:flex flex-wrap gap-2 mb-6">
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveTab(cat.key)}
              className={`px-4 min-h-[44px] type-action-label uppercase tracking-[0.06em] transition-all duration-300 border ${
                activeTab === cat.key
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-border/60 bg-card/30 text-secondary-foreground hover:border-accent/30 hover:text-foreground'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <p className="sm:hidden text-[11.5px] leading-snug text-secondary-foreground font-body mb-2">
          Clica a sobre de cada jugador per veure el resultat prova a prova.
        </p>

      </section>


      {/* Table section */}
      <section className="container pb-14">
        {isLoading ? (
          <p className="type-body-secondary py-8 text-center">{t('common.loading')}</p>
        ) : (
          <div className="border border-border/50 bg-card/30">
            <div className="flex items-center justify-between px-4 sm:px-7 py-4 border-b border-border/40">
              <h3 className="type-eyebrow text-foreground">
                {categories.find(c => c.key === activeTab)?.label}
              </h3>

            </div>
            <div className="px-3 sm:px-7 py-2">
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