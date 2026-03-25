import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Target, TrendingUp, BarChart3, Award, Repeat } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';

const Stats = () => {
  const { t } = useTranslation();

  const { data: results, isLoading } = useQuery({
    queryKey: ['public-stats-data'],
    queryFn: async () => {
      const { data } = await supabase
        .from('results')
        .select('player_id, stableford_points, scratch_score, scorecard, rounds!inner(status, name), players(name)')
        .eq('rounds.status', 'published');
      return data || [];
    },
  });

  const stats = useMemo(() => {
    if (!results?.length) return null;

    // Per-player aggregates
    const byPlayer = new Map<string, { name: string; stableford: number[]; scratch: number[]; birdies: number; pars: number }>();

    for (const r of results) {
      const name = (r.players as any)?.name || 'Desconegut';
      const pid = r.player_id;
      if (!byPlayer.has(pid)) {
        byPlayer.set(pid, { name, stableford: [], scratch: [], birdies: 0, pars: 0 });
      }
      const p = byPlayer.get(pid)!;
      if (r.stableford_points != null) p.stableford.push(r.stableford_points);
      if (r.scratch_score != null) p.scratch.push(r.scratch_score);

      // Count birdies and pars from scorecard (basic: hole score vs par)
      // We don't have par info stored with results, so we'll skip hole-by-hole stats for now
      // unless we add course par data
    }

    const players = Array.from(byPlayer.entries());

    // Best single round (stableford)
    let bestRound = { name: '—', value: 0, round: '' };
    for (const r of results) {
      if (r.stableford_points != null && r.stableford_points > bestRound.value) {
        bestRound = { name: (r.players as any)?.name || '', value: r.stableford_points, round: (r.rounds as any)?.name || '' };
      }
    }

    // Best avg stableford (min 2 rounds)
    let bestAvgStableford = { name: '—', value: 0 };
    for (const [, p] of players) {
      if (p.stableford.length >= 2) {
        const avg = p.stableford.reduce((a, b) => a + b, 0) / p.stableford.length;
        if (avg > bestAvgStableford.value) {
          bestAvgStableford = { name: p.name, value: Math.round(avg * 10) / 10 };
        }
      }
    }

    // Best avg scratch (min 2 rounds, lower is better)
    let bestAvgScratch = { name: '—', value: 999 };
    for (const [, p] of players) {
      if (p.scratch.length >= 2) {
        const avg = p.scratch.reduce((a, b) => a + b, 0) / p.scratch.length;
        if (avg < bestAvgScratch.value) {
          bestAvgScratch = { name: p.name, value: Math.round(avg * 10) / 10 };
        }
      }
    }

    // Most rounds played (regularity)
    let mostRegular = { name: '—', value: 0 };
    for (const [, p] of players) {
      if (p.stableford.length > mostRegular.value) {
        mostRegular = { name: p.name, value: p.stableford.length };
      }
    }

    // Most consistent (lowest std deviation, min 2 rounds)
    let mostConsistent = { name: '—', value: 0 };
    let lowestStdDev = Infinity;
    for (const [, p] of players) {
      if (p.stableford.length >= 2) {
        const avg = p.stableford.reduce((a, b) => a + b, 0) / p.stableford.length;
        const variance = p.stableford.reduce((sum, v) => sum + (v - avg) ** 2, 0) / p.stableford.length;
        const stdDev = Math.sqrt(variance);
        if (stdDev < lowestStdDev) {
          lowestStdDev = stdDev;
          mostConsistent = { name: p.name, value: Math.round(avg * 10) / 10 };
        }
      }
    }

    // Total players and results
    const totalPlayers = players.length;
    const totalResults = results.length;

    return {
      bestRound,
      bestAvgStableford,
      bestAvgScratch: bestAvgScratch.value < 999 ? bestAvgScratch : { name: '—', value: 0 },
      mostRegular,
      mostConsistent,
      totalPlayers,
      totalResults,
    };
  }, [results]);

  const statCards = stats ? [
    { icon: Trophy, label: t('stats.bestRound'), value: `${stats.bestRound.value} pts`, detail: `${stats.bestRound.name} — ${stats.bestRound.round}` },
    { icon: TrendingUp, label: t('stats.avgStableford'), value: `${stats.bestAvgStableford.value} pts`, detail: stats.bestAvgStableford.name },
    { icon: Target, label: t('stats.avgScratch'), value: `${stats.bestAvgScratch.value}`, detail: stats.bestAvgScratch.name },
    { icon: Repeat, label: t('stats.regularity'), value: `${stats.mostRegular.value} jornades`, detail: stats.mostRegular.name },
    { icon: BarChart3, label: 'Més consistent', value: `${stats.mostConsistent.value} pts/avg`, detail: stats.mostConsistent.name },
    { icon: Award, label: 'Participació', value: `${stats.totalPlayers} jugadors`, detail: `${stats.totalResults} resultats totals` },
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
          {statCards.map((card) => (
            <Card key={card.label} className="border-border/60 hover:shadow-md transition-shadow">
              <CardHeader className="pb-2 flex-row items-center gap-3 space-y-0">
                <card.icon className="h-5 w-5 text-primary" />
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-display font-bold text-foreground">{card.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{card.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Stats;
