import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Tables } from '@/integrations/supabase/types';

type Result = Tables<'results'> & { players: { name: string; license: string; gender: string | null; is_senior: boolean } | null; rounds: { is_master: boolean; master_coefficient: number; name: string } | null };

const Rankings = () => {
  const { t } = useTranslation();

  const { data: results, isLoading } = useQuery({
    queryKey: ['public-rankings-data'],
    queryFn: async () => {
      const { data } = await supabase
        .from('results')
        .select('*, players(name, license, gender, is_senior), rounds!inner(is_master, master_coefficient, name, status)')
        .eq('rounds.status', 'published')
        .not('stableford_points', 'is', null);
      return (data || []) as Result[];
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
    if (!results?.length) return {};

    // Group results by player
    const byPlayer = new Map<string, { name: string; gender: string | null; is_senior: boolean; scores: { points: number; roundName: string; isMaster: boolean; coef: number }[] }>();

    for (const r of results) {
      if (!r.players || r.stableford_points == null) continue;
      const pid = r.player_id;
      if (!byPlayer.has(pid)) {
        byPlayer.set(pid, {
          name: r.players.name,
          gender: r.players.gender,
          is_senior: r.players.is_senior,
          scores: [],
        });
      }
      byPlayer.get(pid)!.scores.push({
        points: r.stableford_points,
        roundName: r.rounds?.name || '',
        isMaster: r.rounds?.is_master || false,
        coef: r.rounds?.master_coefficient || 1,
      });
    }

    // Calculate totals (best N, with master coefficient)
    const allPlayers = Array.from(byPlayer.entries()).map(([id, p]) => {
      const weighted = p.scores.map(s => ({
        ...s,
        weighted: Math.round(s.points * (s.isMaster ? s.coef : 1)),
      }));
      weighted.sort((a, b) => b.weighted - a.weighted);
      const bestScores = weighted.slice(0, bestN);
      const total = bestScores.reduce((sum, s) => sum + s.weighted, 0);

      return { id, name: p.name, gender: p.gender, is_senior: p.is_senior, total, roundsPlayed: p.scores.length, bestScores };
    });

    allPlayers.sort((a, b) => b.total - a.total || a.roundsPlayed - b.roundsPlayed);

    // Determine category: use handicap at first round (simplified: we use all players)
    // For now, return as general ranking. Categories filter by gender/senior
    return {
      general: allPlayers,
      female: allPlayers.filter(p => p.gender === 'F'),
      senior: allPlayers.filter(p => p.is_senior),
    };
  }, [results, bestN]);

  const categories = [
    { key: 'general', label: t('rankings.generalClassification') },
    { key: 'female', label: t('categories.female') },
    { key: 'senior', label: t('categories.senior') },
  ];

  const renderTable = (players: typeof rankings.general) => {
    if (!players?.length) return <p className="text-muted-foreground text-sm py-4">{t('common.noData')}</p>;

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 text-muted-foreground">
              <th className="text-left py-2.5 pr-2 w-12">{t('common.position')}</th>
              <th className="text-left py-2.5">{t('common.name')}</th>
              <th className="text-right py-2.5 px-2">Jornades</th>
              <th className="text-right py-2.5 font-bold">{t('common.total')}</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={p.id} className={`border-b border-border/20 last:border-0 ${i < 3 ? 'bg-accent/5' : ''}`}>
                <td className="py-2 pr-2 font-mono font-bold text-muted-foreground">
                  {i + 1}
                  {i === 0 && <span className="ml-1">🥇</span>}
                  {i === 1 && <span className="ml-1">🥈</span>}
                  {i === 2 && <span className="ml-1">🥉</span>}
                </td>
                <td className="py-2 font-medium">{p.name}</td>
                <td className="py-2 px-2 text-right font-mono text-muted-foreground">{p.roundsPlayed}</td>
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
      <h1 className="font-display text-3xl font-bold mb-2">{t('rankings.title')}</h1>
      <p className="text-muted-foreground mb-8">
        {t('rankings.generalClassification')} — {t('common.season')} 2026
        <Badge variant="outline" className="ml-2 text-xs">Millors {bestN} jornades</Badge>
      </p>

      {isLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <Tabs defaultValue="general">
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
