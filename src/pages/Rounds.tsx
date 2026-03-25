import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin, Users, ChevronDown, ChevronUp } from 'lucide-react';
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
        .select('*, players(name, license, club)')
        .eq('round_id', expandedRound)
        .order('stableford_points', { ascending: false });
      return data || [];
    },
    enabled: !!expandedRound,
  });

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
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/40 text-muted-foreground">
                            <th className="text-left py-2 pr-2 w-10">{t('common.position')}</th>
                            <th className="text-left py-2">{t('common.name')}</th>
                            <th className="text-right py-2 px-2">{t('common.handicap')}</th>
                            <th className="text-right py-2 px-2">Stableford</th>
                            <th className="text-right py-2">Scratch</th>
                          </tr>
                        </thead>
                        <tbody>
                          {roundResults.map((r, i) => (
                            <tr key={r.id} className="border-b border-border/20 last:border-0">
                              <td className="py-1.5 pr-2 font-mono text-muted-foreground">{i + 1}</td>
                              <td className="py-1.5 font-medium">{(r.players as any)?.name}</td>
                              <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">{r.handicap_at_round ?? '—'}</td>
                              <td className="py-1.5 px-2 text-right font-mono font-bold text-primary">{r.stableford_points ?? '—'}</td>
                              <td className="py-1.5 text-right font-mono">{r.scratch_score ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
