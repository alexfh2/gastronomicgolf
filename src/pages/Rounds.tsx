import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, MapPin, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ca, es } from 'date-fns/locale';

const Rounds = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ca' ? ca : es;
  const [expandedRound, setExpandedRound] = useState<string | null>(null);

  const { data: rounds, isLoading } = useQuery({
    queryKey: ['public-rounds'],
    queryFn: async () => {
      const { data } = await supabase
        .from('rounds')
        .select('*')
        .eq('status', 'published')
        .order('date', { ascending: true });
      return data || [];
    },
  });

  const { data: roundResults } = useQuery({
    queryKey: ['public-round-results', expandedRound],
    queryFn: async () => {
      if (!expandedRound) return [];
      const { data } = await supabase
        .from('results')
        .select('*, players(id, name, license, club, gender, is_senior, current_handicap)')
        .eq('round_id', expandedRound)
        .order('stableford_points', { ascending: false });
      return data || [];
    },
    enabled: !!expandedRound,
  });

  const categorizeResults = (results: typeof roundResults) => {
    if (!results) return {};
    const all = results;

    // Scratch: sorted by scratch_score ascending (lower better)
    const scratch = [...all].filter(r => r.scratch_score != null).sort((a, b) => (a.scratch_score ?? 999) - (b.scratch_score ?? 999));

    // HCP Bajo: handicap ≤ 15.0, stableford desc
    const hcpLow = all.filter(r => {
      const hcp = r.handicap_at_round ?? (r.players as any)?.current_handicap;
      return hcp != null && hcp <= 15.0;
    }).sort((a, b) => (b.stableford_points ?? 0) - (a.stableford_points ?? 0));

    // HCP Alto: handicap 15.1 - 36
    const hcpHigh = all.filter(r => {
      const hcp = r.handicap_at_round ?? (r.players as any)?.current_handicap;
      return hcp != null && hcp > 15.0 && hcp <= 36;
    }).sort((a, b) => (b.stableford_points ?? 0) - (a.stableford_points ?? 0));

    // Female
    const female = all.filter(r => (r.players as any)?.gender === 'F')
      .sort((a, b) => (b.stableford_points ?? 0) - (a.stableford_points ?? 0));

    // Senior
    const senior = all.filter(r => (r.players as any)?.is_senior)
      .sort((a, b) => (b.stableford_points ?? 0) - (a.stableford_points ?? 0));

    return { scratch, hcpLow, hcpHigh, female, senior };
  };

  const renderResultsTable = (results: any[], mode: 'stableford' | 'scratch') => {
    if (!results?.length) return <p className="text-sm text-muted-foreground py-2">{t('common.noData')}</p>;
    const isScratch = mode === 'scratch';

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 text-muted-foreground">
              <th className="text-left py-2 pr-2 w-10">{t('common.position')}</th>
              <th className="text-left py-2">{t('common.name')}</th>
              <th className="text-right py-2 px-2">{t('common.handicap')}</th>
              <th className="text-right py-2 px-2">{isScratch ? 'Scratch' : 'Stableford'}</th>
              {!isScratch && <th className="text-right py-2">Scratch</th>}
            </tr>
          </thead>
          <tbody>
            {results.map((r: any, i: number) => (
              <tr key={r.id} className="border-b border-border/20 last:border-0">
                <td className="py-1.5 pr-2 font-mono text-muted-foreground">{i + 1}</td>
                <td className="py-1.5 font-medium">
                  <Link to={`/jugadors/${r.player_id}`} className="hover:text-primary transition-colors">
                    {(r.players as any)?.name}
                  </Link>
                </td>
                <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">{r.handicap_at_round ?? '—'}</td>
                <td className="py-1.5 px-2 text-right font-mono font-bold text-primary">
                  {isScratch ? (r.scratch_score ?? '—') : (r.stableford_points ?? '—')}
                </td>
                {!isScratch && <td className="py-1.5 text-right font-mono">{r.scratch_score ?? '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const categorized = categorizeResults(roundResults);

  const roundCategories = [
    { key: 'scratch', label: 'Scratch', mode: 'scratch' as const },
    { key: 'hcpLow', label: 'HCP Baix (≤15)', mode: 'stableford' as const },
    { key: 'hcpHigh', label: 'HCP Alt (15.1-36)', mode: 'stableford' as const },
    { key: 'female', label: t('categories.female'), mode: 'stableford' as const },
    { key: 'senior', label: t('categories.senior'), mode: 'stableford' as const },
  ];

  return (
    <div className="container py-8 lg:py-12 animate-fade-in">
      <h1 className="font-display text-3xl font-bold mb-2">{t('rounds.title')}</h1>
      <p className="text-muted-foreground mb-8">{t('rounds.calendar')} — {t('common.season')} 2026</p>

      {isLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : !rounds?.length ? (
        <p className="text-muted-foreground">{t('common.noData')}</p>
      ) : (
        <div className="space-y-3">
          {rounds.map((round) => (
            <Card key={round.id} className="border-border/60 overflow-hidden">
              <button
                onClick={() => setExpandedRound(expandedRound === round.id ? null : round.id)}
                className="w-full text-left"
              >
                <CardContent className="p-4 sm:p-6 flex items-center justify-between">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display text-lg font-bold">{round.name}</span>
                      {round.is_master && (
                        <Badge variant="secondary" className="text-xs bg-accent/20 text-accent border-0">MASTER</Badge>
                      )}
                      {round.sponsor && (
                        <span className="text-xs text-muted-foreground">· {round.sponsor}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(new Date(round.date), 'dd MMM yyyy', { locale })}
                        {round.end_date && round.end_date !== round.date && (
                          <> — {format(new Date(round.end_date), 'dd MMM yyyy', { locale })}</>
                        )}
                      </span>
                      {round.club && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {round.club}
                        </span>
                      )}
                    </div>
                  </div>
                  {expandedRound === round.id ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </CardContent>
              </button>

              {expandedRound === round.id && (
                <div className="border-t border-border/40 px-4 sm:px-6 py-4">
                  <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>{roundResults?.length || 0} {t('rounds.participants').toLowerCase()}</span>
                  </div>
                  {roundResults && roundResults.length > 0 ? (
                    <Tabs defaultValue="scratch">
                      <TabsList className="flex-wrap h-auto gap-1 mb-4">
                        {roundCategories.map(cat => (
                          <TabsTrigger key={cat.key} value={cat.key} className="text-xs">
                            {cat.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      {roundCategories.map(cat => (
                        <TabsContent key={cat.key} value={cat.key}>
                          {renderResultsTable((categorized as any)[cat.key], cat.mode)}
                        </TabsContent>
                      ))}
                    </Tabs>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Rounds;
