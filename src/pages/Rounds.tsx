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
    queryKey: ['public-rounds-all'],
    queryFn: async () => {
      const { data } = await supabase
        .from('rounds')
        .select('*')
        .order('date', { ascending: true });
      return data || [];
    },
  });

  const today = new Date().toISOString().split('T')[0];

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

    // HCP Bajo: handicap ≤ 15.0, stableford desc
    const hcpLow = results.filter(r => {
      const hcp = r.handicap_at_round ?? (r.players as any)?.current_handicap;
      return hcp != null && hcp <= 15.0;
    }).sort((a, b) => (b.stableford_points ?? 0) - (a.stableford_points ?? 0));

    // HCP Alto: handicap 15.1 - 36
    const hcpHigh = results.filter(r => {
      const hcp = r.handicap_at_round ?? (r.players as any)?.current_handicap;
      return hcp != null && hcp > 15.0 && hcp <= 36;
    }).sort((a, b) => (b.stableford_points ?? 0) - (a.stableford_points ?? 0));

    // Female
    const female = results.filter(r => (r.players as any)?.gender === 'F')
      .sort((a, b) => (b.stableford_points ?? 0) - (a.stableford_points ?? 0));

    // Senior
    const senior = results.filter(r => (r.players as any)?.is_senior)
      .sort((a, b) => (b.stableford_points ?? 0) - (a.stableford_points ?? 0));

    return { hcpLow, hcpHigh, female, senior };
  };

  const renderResultsTable = (results: any[]) => {
    if (!results?.length) return <p className="text-sm text-muted-foreground py-2">{t('common.noData')}</p>;

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 text-muted-foreground">
              <th className="text-left py-2 pr-2 w-10">{t('common.position')}</th>
              <th className="text-left py-2">{t('common.name')}</th>
              <th className="text-right py-2 px-2">{t('common.handicap')}</th>
              <th className="text-right py-2 px-2">Stableford</th>
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
                  {r.stableford_points ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const categorized = categorizeResults(roundResults);

  const roundCategories = [
    { key: 'hcpLow', label: 'HCP Baix (≤15)' },
    { key: 'hcpHigh', label: 'HCP Alt (15.1-36)' },
    { key: 'female', label: t('categories.female') },
    { key: 'senior', label: t('categories.senior') },
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
          {rounds.map((round) => {
            const played = round.date < today || (round.end_date && round.end_date < today);
            const hasResults = round.status === 'published';
            return (
            <Card key={round.id} className={`overflow-hidden ${played ? 'border-green-500/40 bg-green-50/30 dark:bg-green-950/10' : 'border-border/40 bg-background'}`}>
              <button
                onClick={() => hasResults ? setExpandedRound(expandedRound === round.id ? null : round.id) : null}
                className={`w-full text-left ${!hasResults ? 'cursor-default' : ''}`}
              >
                <CardContent className="p-4 sm:p-6 flex items-center justify-between">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-mono text-xs w-6 ${played ? 'text-green-600/60' : 'text-muted-foreground/40'}`}>J{round.round_number}</span>
                      <span className={`font-display text-lg font-bold ${played ? 'text-foreground' : 'text-muted-foreground/50'}`}>{round.name}</span>
                      {round.is_master && (
                        <Badge variant="secondary" className="text-xs bg-accent/20 text-accent border-0">MASTER</Badge>
                      )}
                      {played ? (
                        <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">
                          ✓ {t('rounds.played', 'Jugada')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] border-muted-foreground/20 text-muted-foreground/50">
                          {t('rounds.pending', 'Pendent')}
                        </Badge>
                      )}
                      {round.sponsor && (
                        <span className={`text-xs ${played ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>· {round.sponsor}</span>
                      )}
                    </div>
                    <div className={`flex items-center gap-4 text-sm ${played ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(new Date(round.date), 'dd MMM yyyy', { locale })}
                        {round.end_date && round.end_date !== round.date && (
                          <> — {format(new Date(round.end_date), 'dd MMM yyyy', { locale })}</>
                        )}
                      </span>
                      {round.course && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {round.course}
                        </span>
                      )}
                    </div>
                    {/* Results status line */}
                    <div className="pt-1">
                      {hasResults ? (
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1 cursor-pointer hover:underline">
                          📊 {t('rounds.viewResults', 'Veure resultats')}
                          <ChevronDown className={`h-3 w-3 transition-transform ${expandedRound === round.id ? 'rotate-180' : ''}`} />
                        </span>
                      ) : played ? (
                        <span className="text-xs text-amber-500/80 italic">{t('rounds.pendingResults', 'Pendent de pujar resultats')}</span>
                      ) : null}
                    </div>
                  </div>
                  {hasResults && (
                    expandedRound === round.id ? (
                      <ChevronUp className="h-5 w-5 text-green-600" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground/40" />
                    )
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
                    <Tabs defaultValue="hcpLow">
                      <TabsList className="flex-wrap h-auto gap-1 mb-4">
                        {roundCategories.map(cat => (
                          <TabsTrigger key={cat.key} value={cat.key} className="text-xs">
                            {cat.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      {roundCategories.map(cat => (
                        <TabsContent key={cat.key} value={cat.key}>
                          {renderResultsTable((categorized as any)[cat.key])}
                        </TabsContent>
                      ))}
                    </Tabs>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
                  )}
                </div>
              )}
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Rounds;
