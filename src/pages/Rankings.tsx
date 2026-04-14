import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Tables } from '@/integrations/supabase/types';

type Result = Tables<'results'> & {
  players: { name: string; license: string; gender: string | null; is_senior: boolean; current_handicap: number | null } | null;
  rounds: { is_master: boolean; master_coefficient: number; name: string; round_number: number } | null;
};

const Rankings = () => {
  const { t } = useTranslation();

  const { data: results, isLoading } = useQuery({
    queryKey: ['public-rankings-data'],
    queryFn: async () => {
      const { data } = await supabase
        .from('results')
        .select('*, players(name, license, gender, is_senior, current_handicap), rounds!inner(is_master, master_coefficient, name, round_number, status)')
        .eq('rounds.status', 'published')
        .not('stableford_points', 'is', null);
      return (data || []) as Result[];
    },
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

    const byPlayer = new Map<string, {
      name: string;
      gender: string | null;
      is_senior: boolean;
      handicap: number | null;
      scores: { points: number; roundId: string; roundNumber: number; roundName: string; isMaster: boolean; coef: number }[];
    }>();

    for (const r of results) {
      if (!r.players || r.stableford_points == null) continue;
      const pid = r.player_id;
      if (!byPlayer.has(pid)) {
        byPlayer.set(pid, {
          name: r.players.name,
          gender: r.players.gender,
          is_senior: r.players.is_senior,
          handicap: r.handicap_at_round ?? r.players.current_handicap,
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

    // HCP Bajo: handicap ≤ 15.0
    const hcpLow = buildRanking(p => p.handicap != null && p.handicap <= 15.0);
    hcpLow.sort((a, b) => b.total - a.total);

    // HCP Alto: handicap 15.1 - 36
    const hcpHigh = buildRanking(p => p.handicap != null && p.handicap > 15.0 && p.handicap <= 36);
    hcpHigh.sort((a, b) => b.total - a.total);

    // Female
    const female = buildRanking(p => p.gender === 'F');
    female.sort((a, b) => b.total - a.total);

    // Senior
    const senior = buildRanking(p => p.is_senior);
    senior.sort((a, b) => b.total - a.total);

    return { hcpLow, hcpHigh, female, senior };
  }, [results, rounds, bestN]);

  const categories = [
    { key: 'hcpLow', label: 'HCP Baix (≤15.0)' },
    { key: 'hcpHigh', label: 'HCP Alt (15.1-36)' },
    { key: 'female', label: t('categories.female') },
    { key: 'senior', label: t('categories.senior') },
  ];

  const renderTable = (players: any[] | undefined) => {
    if (!players?.length) return <p className="text-muted-foreground text-sm py-4">{t('common.noData')}</p>;

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 text-muted-foreground">
              <th className="text-left py-2.5 pr-2 w-12">{t('common.position')}</th>
              <th className="text-left py-2.5">{t('common.name')}</th>
              <th className="text-right py-2.5 px-2">Últim HCP</th>
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
                  <Link to={`/jugadors/${p.id}`} className="hover:text-primary transition-colors">
                    {p.name}
                  </Link>
                </td>
                <td className="py-2 px-2 text-right font-mono text-xs text-muted-foreground">{p.handicap ?? '—'}</td>
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
      <div className="bg-primary/10 rounded-lg px-5 py-4 mb-8 border border-primary/15">
        <h1 className="font-display text-3xl font-bold text-primary">{t('rankings.title')}</h1>
        <p className="text-primary/70 mt-1">
          {t('rankings.generalClassification')} — {t('common.season')} 2026
          <Badge variant="outline" className="ml-2 text-[10px] tracking-wider uppercase">Millors {bestN} jornades</Badge>
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
    </div>
  );
};

export default Rankings;
