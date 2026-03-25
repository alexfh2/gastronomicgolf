import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Trophy, BarChart3, Users, ArrowRight, Calendar, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ca, es } from 'date-fns/locale';

const Index = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ca' ? ca : es;

  const { data: rounds } = useQuery({
    queryKey: ['public-rounds-home'],
    queryFn: async () => {
      const { data } = await supabase
        .from('rounds')
        .select('id, name, date, end_date, club, course, sponsor, status, is_master, round_number')
        .eq('status', 'published')
        .order('date', { ascending: true });
      return data || [];
    },
  });

  const { data: topResults } = useQuery({
    queryKey: ['public-top-results'],
    queryFn: async () => {
      const { data } = await supabase
        .from('results')
        .select('stableford_points, player_id, round_id, players(name), rounds!inner(status)')
        .eq('rounds.status', 'published')
        .not('stableford_points', 'is', null)
        .order('stableford_points', { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  const now = new Date().toISOString().split('T')[0];
  const nextRound = rounds?.find(r => r.date >= now);
  const lastRound = rounds ? [...rounds].reverse().find(r => r.date < now) : null;

  const quickLinks = [
    { icon: Trophy, label: t('home.viewRankings'), path: '/ranquings', color: 'text-accent' },
    { icon: BarChart3, label: t('home.viewStats'), path: '/estadistiques', color: 'text-primary' },
    { icon: Users, label: t('home.comparePlayers'), path: '/comparador', color: 'text-accent' },
  ];

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="relative overflow-hidden bg-primary py-20 lg:py-28">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 30% 50%, hsl(38 60% 55% / 0.3), transparent 60%)',
        }} />
        <div className="container relative text-center">
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-primary-foreground mb-4">
            {t('home.title')}
          </h1>
          <p className="text-primary-foreground/80 text-lg md:text-xl max-w-2xl mx-auto mb-2">
            {t('home.subtitle')}
          </p>
          <p className="inline-flex items-center gap-2 mt-4 px-4 py-1.5 rounded-full bg-accent/20 text-accent text-sm font-semibold tracking-wide uppercase">
            {t('common.season')} 2026
          </p>
        </div>
      </section>

      {/* Quick Access */}
      <section className="container py-12 lg:py-16">
        <h2 className="font-display text-2xl font-semibold mb-8 text-center">
          {t('home.quickAccess')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {quickLinks.map((link) => (
            <Link key={link.path} to={link.path}>
              <Card className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 cursor-pointer border-border/60">
                <CardContent className="flex flex-col items-center gap-3 p-6">
                  <link.icon className={`h-8 w-8 ${link.color}`} />
                  <span className="text-sm font-medium text-foreground">{link.label}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Next/Last round + Top results */}
      <section className="container pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Next / Last Round */}
          <Card className="border-border/60">
            <CardContent className="p-6">
              <h3 className="font-display text-lg font-semibold mb-4">
                {nextRound ? t('home.nextRound') : t('home.lastRound')}
              </h3>
              {(nextRound || lastRound) ? (
                <div className="space-y-2">
                  <p className="text-xl font-bold text-foreground">
                    {(nextRound || lastRound)!.name}
                    {(nextRound || lastRound)!.is_master && (
                      <span className="ml-2 text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full font-semibold">MASTER</span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Calendar className="h-4 w-4" />
                    <span>{format(new Date((nextRound || lastRound)!.date), 'dd MMMM yyyy', { locale })}</span>
                  </div>
                  {(nextRound || lastRound)!.club && (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <MapPin className="h-4 w-4" />
                      <span>{(nextRound || lastRound)!.club}{(nextRound || lastRound)!.course ? ` — ${(nextRound || lastRound)!.course}` : ''}</span>
                    </div>
                  )}
                  {(nextRound || lastRound)!.sponsor && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('rounds.sponsor')}: {(nextRound || lastRound)!.sponsor}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">{t('common.noData')}</p>
              )}
            </CardContent>
          </Card>

          {/* Top results */}
          <Card className="border-border/60">
            <CardContent className="p-6">
              <h3 className="font-display text-lg font-semibold mb-4">{t('home.topPlayers')}</h3>
              {topResults && topResults.length > 0 ? (
                <div className="space-y-2">
                  {topResults.map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-muted-foreground w-5">{i + 1}</span>
                        <span className="text-sm font-medium">{(r.players as any)?.name}</span>
                      </div>
                      <span className="font-mono font-bold text-sm text-primary">{r.stableford_points} pts</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">{t('common.noData')}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default Index;
