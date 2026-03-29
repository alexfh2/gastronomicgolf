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
    { icon: Trophy, label: t('home.viewRankings'), path: '/ranquings' },
    { icon: BarChart3, label: t('home.viewStats'), path: '/estadistiques' },
    { icon: Users, label: t('home.comparePlayers'), path: '/comparador' },
  ];

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="relative overflow-hidden bg-primary py-24 lg:py-32">
        <div className="absolute inset-0 opacity-[0.07]" style={{
          backgroundImage: 'radial-gradient(circle at 25% 40%, hsl(38 60% 55%), transparent 50%), radial-gradient(circle at 75% 60%, hsl(38 60% 55%), transparent 50%)',
        }} />
        <div className="container relative text-center">
          <p className="text-primary-foreground/50 text-xs font-medium tracking-[0.25em] uppercase mb-6">
            {t('common.season')} 2026
          </p>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-primary-foreground mb-5 tracking-tight">
            {t('home.title')}
          </h1>
          <p className="text-primary-foreground/70 text-lg md:text-xl max-w-xl mx-auto leading-relaxed">
            {t('home.subtitle')}
          </p>
        </div>
      </section>

      {/* Quick Access */}
      <section className="container py-14 lg:py-20">
        <h2 className="font-display text-2xl font-semibold mb-10 text-center tracking-tight">
          {t('home.quickAccess')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-3xl mx-auto">
          {quickLinks.map((link) => (
            <Link key={link.path} to={link.path}>
              <Card className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 cursor-pointer border-border/40">
                <CardContent className="flex flex-col items-center gap-4 p-8">
                  <link.icon className="h-7 w-7 text-accent" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-foreground tracking-wide">{link.label}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Next/Last round + Top results */}
      <section className="container pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Next / Last Round */}
          <Card className="border-border/40">
            <CardContent className="p-7">
              <h3 className="font-display text-lg font-semibold mb-5 tracking-tight">
                {nextRound ? t('home.nextRound') : t('home.lastRound')}
              </h3>
              {(nextRound || lastRound) ? (
                <div className="space-y-3">
                  <p className="text-xl font-bold text-foreground tracking-tight">
                    {(nextRound || lastRound)!.name}
                    {(nextRound || lastRound)!.is_master && (
                      <span className="ml-2 text-[10px] bg-accent/15 text-accent px-2.5 py-0.5 rounded font-semibold uppercase tracking-wider">Master</span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Calendar className="h-4 w-4" strokeWidth={1.5} />
                    <span>{format(new Date((nextRound || lastRound)!.date), 'dd MMMM yyyy', { locale })}</span>
                  </div>
                  {(nextRound || lastRound)!.club && (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <MapPin className="h-4 w-4" strokeWidth={1.5} />
                      <span>{(nextRound || lastRound)!.club}{(nextRound || lastRound)!.course ? ` — ${(nextRound || lastRound)!.course}` : ''}</span>
                    </div>
                  )}
                  {(nextRound || lastRound)!.sponsor && (
                    <p className="text-xs text-muted-foreground/70 mt-1 tracking-wide">
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
          <Card className="border-border/40">
            <CardContent className="p-7">
              <h3 className="font-display text-lg font-semibold mb-5 tracking-tight">{t('home.topPlayers')}</h3>
              {topResults && topResults.length > 0 ? (
                <div className="space-y-0">
                  {topResults.map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-mono w-5 ${i < 3 ? 'text-accent font-bold' : 'text-muted-foreground'}`}>{i + 1}</span>
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
