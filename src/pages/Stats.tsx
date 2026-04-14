import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Trophy, TrendingUp, BarChart3, Award, Repeat, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type LeaderboardEntry = { name: string; value: number; detail?: string };

const Stats = () => {
  const { t } = useTranslation();
  const [openCards, setOpenCards] = useState<Set<number>>(new Set());

  const toggleCard = (idx: number) => {
    setOpenCards(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const { data: results, isLoading } = useQuery({
    queryKey: ['public-stats-data'],
    queryFn: async () => {
      const { data } = await supabase
        .from('results')
        .select('player_id, stableford_points, scorecard, rounds!inner(status, name), players(name)')
        .eq('rounds.status', 'published');
      return data || [];
    },
  });

  const { stats, leaderboards } = useMemo(() => {
    if (!results?.length) return { stats: null, leaderboards: [] as LeaderboardEntry[][] };

    const byPlayer = new Map<string, { name: string; stableford: number[]; rounds: string[] }>();

    for (const r of results) {
      const name = (r.players as any)?.name || 'Desconegut';
      const pid = r.player_id;
      if (!byPlayer.has(pid)) {
        byPlayer.set(pid, { name, stableford: [], rounds: [] });
      }
      const p = byPlayer.get(pid)!;
      if (r.stableford_points != null) {
        p.stableford.push(r.stableford_points);
        p.rounds.push((r.rounds as any)?.name || '');
      }
    }

    const players = Array.from(byPlayer.entries());

    // === Best single round ===
    const allRounds: { name: string; value: number; detail: string }[] = [];
    for (const r of results) {
      if (r.stableford_points != null) {
        allRounds.push({
          name: (r.players as any)?.name || '',
          value: r.stableford_points,
          detail: (r.rounds as any)?.name || '',
        });
      }
    }
    allRounds.sort((a, b) => b.value - a.value);
    const top10BestRound = allRounds.slice(0, 10);

    // === Best avg stableford (min 2 rounds) ===
    const avgList: LeaderboardEntry[] = [];
    for (const [, p] of players) {
      if (p.stableford.length >= 2) {
        const avg = p.stableford.reduce((a, b) => a + b, 0) / p.stableford.length;
        avgList.push({ name: p.name, value: Math.round(avg * 10) / 10, detail: `${p.stableford.length} jornades` });
      }
    }
    avgList.sort((a, b) => b.value - a.value);
    const top10Avg = avgList.slice(0, 10);

    // === Regularity (most rounds) ===
    const regList: LeaderboardEntry[] = [];
    for (const [, p] of players) {
      regList.push({ name: p.name, value: p.stableford.length });
    }
    regList.sort((a, b) => b.value - a.value);
    const top10Reg = regList.slice(0, 10);

    // === Most consistent (lowest std dev, min 2 rounds) ===
    const conList: { name: string; value: number; stdDev: number }[] = [];
    for (const [, p] of players) {
      if (p.stableford.length >= 2) {
        const avg = p.stableford.reduce((a, b) => a + b, 0) / p.stableford.length;
        const variance = p.stableford.reduce((sum, v) => sum + (v - avg) ** 2, 0) / p.stableford.length;
        const stdDev = Math.sqrt(variance);
        conList.push({ name: p.name, value: Math.round(avg * 10) / 10, stdDev });
      }
    }
    conList.sort((a, b) => a.stdDev - b.stdDev);
    const top10Con: LeaderboardEntry[] = conList.slice(0, 10).map(c => {
      // Find player's min/max for range display
      const playerData = players.find(([, p]) => p.name === c.name)?.[1];
      const min = playerData ? Math.min(...playerData.stableford) : 0;
      const max = playerData ? Math.max(...playerData.stableford) : 0;
      return {
        name: c.name,
        value: c.value,
        detail: `${min}–${max} pts · ±${c.stdDev.toFixed(1)}`,
      };
    });

    const bestRound = top10BestRound[0] || { name: '—', value: 0, detail: '' };
    const bestAvg = top10Avg[0] || { name: '—', value: 0 };
    const mostReg = top10Reg[0] || { name: '—', value: 0 };
    const mostCon = top10Con[0] || { name: '—', value: 0 };

    const totalPlayers = players.length;
    const totalResults = results.length;

    return {
      stats: { bestRound, bestAvg, mostReg, mostCon, totalPlayers, totalResults },
      leaderboards: [top10BestRound, top10Avg, top10Reg, top10Con, [] as LeaderboardEntry[]],
    };
  }, [results]);

  const statCards = stats ? [
    { icon: Trophy, label: t('stats.bestRound'), value: `${stats.bestRound.value} pts`, detail: `${stats.bestRound.name} — ${stats.bestRound.detail}`, subtitle: '', unit: 'pts' },
    { icon: TrendingUp, label: t('stats.avgStableford'), value: `${stats.bestAvg.value} pts`, detail: stats.bestAvg.name, subtitle: '', unit: 'pts' },
    { icon: Repeat, label: t('stats.regularity'), value: `${stats.mostReg.value} jornades`, detail: stats.mostReg.name, subtitle: '', unit: 'jornades' },
    { icon: BarChart3, label: 'Més consistent', value: `${stats.mostCon.value} pts/avg`, detail: stats.mostCon.name, subtitle: 'Menor variació entre jornades (desviació estàndard més baixa)', unit: 'avg' },
    { icon: Award, label: 'Participació', value: `${stats.totalPlayers} jugadors`, detail: `${stats.totalResults} resultats totals`, subtitle: '', unit: '' },
  ] : [];

  return (
    <div className="container py-8 lg:py-12 animate-fade-in">
      <h1 className="font-display text-3xl font-bold mb-2">{t('stats.title')}</h1>
      <p className="text-muted-foreground mb-8">{t('common.season')} 2026</p>

      {isLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : !stats ? (
        <p className="text-muted-foreground">{t('common.noData')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {statCards.map((card, idx) => {
            const lb = leaderboards[idx] || [];
            const hasLeaderboard = lb.length > 0;
            const isOpen = openCards.has(idx);

            return (
              <Collapsible key={card.label} open={isOpen} onOpenChange={() => hasLeaderboard && toggleCard(idx)}>
                <Card className={cn(
                  "border-border/60 transition-shadow",
                  hasLeaderboard && "cursor-pointer hover:shadow-md"
                )}>
                  <CollapsibleTrigger asChild disabled={!hasLeaderboard}>
                    <div>
                      <CardHeader className="pb-2 flex-row items-center gap-3 space-y-0">
                        <card.icon className="h-5 w-5 text-primary" />
                        <CardTitle className="text-sm font-medium text-muted-foreground flex-1">{card.label}</CardTitle>
                        {hasLeaderboard && (
                          <ChevronDown className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform duration-200",
                            isOpen && "rotate-180"
                          )} />
                        )}
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-display font-bold text-foreground">{card.value}</p>
                        <p className="text-sm text-muted-foreground mt-1">{card.detail}</p>
                        {card.subtitle && (
                          <p className="text-xs text-muted-foreground/70 mt-2 italic">{card.subtitle}</p>
                        )}
                    </div>
                  </CollapsibleTrigger>

                  {hasLeaderboard && (
                    <CollapsibleContent>
                      <CardContent className="pt-0 pb-4">
                        <div className="border-t border-border/60 pt-3 space-y-1.5">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Top 10</p>
                          {lb.map((entry, i) => (
                            <div key={`${entry.name}-${i}`} className="flex items-center gap-2 text-sm">
                              <span className={cn(
                                "w-6 text-center font-bold text-xs rounded-full py-0.5",
                                i === 0 && "bg-primary/15 text-primary",
                                i === 1 && "bg-muted text-muted-foreground",
                                i === 2 && "bg-muted text-muted-foreground",
                                i > 2 && "text-muted-foreground"
                              )}>
                                {i + 1}
                              </span>
                              <span className="flex-1 truncate text-foreground">{entry.name}</span>
                              <span className="font-semibold text-foreground tabular-nums">
                                {entry.value} <span className="text-xs text-muted-foreground font-normal">{card.unit}</span>
                              </span>
                              {entry.detail && (
                                <span className="text-xs text-muted-foreground hidden sm:inline">({entry.detail})</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  )}
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Stats;
