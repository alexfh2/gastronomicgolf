import { useState } from 'react';
import heroBg from '@/assets/hero-bg.png';
import sponsors from '@/assets/sponsors-row.png';
import logo from '@/assets/logo.png';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Trophy, BarChart3, Users, ArrowRight, Calendar, MapPin, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ca, es } from 'date-fns/locale';
import { fetchPublicCircuitData, publicCircuitDataQueryKey } from '@/lib/publicCircuitData';

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
    queryKey: [...publicCircuitDataQueryKey, 'home-top-results'],
    queryFn: fetchPublicCircuitData,
    select: (data) =>
      [...data.results]
        .filter((result) => result.stableford_points != null)
        .sort((a, b) => (b.stableford_points ?? 0) - (a.stableford_points ?? 0)),
  });

  const now = new Date().toISOString().split('T')[0];
  const nextRound = rounds?.find(r => r.date >= now);
  const lastRound = rounds ? [...rounds].reverse().find(r => r.date < now) : null;
  const featuredRound = nextRound || lastRound;

  // Build per-category top 5
  const categoryResults = (() => {
    if (!topResults?.length) return { hcpLow: [], hcpHigh: [], female: [], senior: [] };

    // Accumulate total points per player across all rounds
    const agg = new Map<string, { name: string; totalPoints: number; rounds: number; gender: string | null; is_senior: boolean; handicap: number | null; playerId: string }>();
    for (const r of topResults) {
      const p = (r as any).players_public;
      if (!p) continue;
      const hcp = r.handicap_at_round ?? p.current_handicap;
      const pts = r.stableford_points ?? 0;
      const existing = agg.get(r.player_id);
      if (existing) {
        existing.totalPoints += pts;
        existing.rounds += 1;
        // Keep most recent handicap
        if (hcp != null) existing.handicap = hcp;
      } else {
        agg.set(r.player_id, {
          name: p.name,
          totalPoints: pts,
          rounds: 1,
          gender: p.gender,
          is_senior: p.is_senior,
          handicap: hcp,
          playerId: r.player_id,
        });
      }
    }

    const all = Array.from(agg.values());
    const hcpLow = all.filter(p => p.handicap != null && p.handicap <= 15).sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 5);
    const hcpHigh = all.filter(p => p.handicap != null && p.handicap > 15 && p.handicap <= 36).sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 5);
    const female = all.filter(p => p.gender === 'F').sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 5);
    const senior = all.filter(p => p.is_senior).sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 5);

    return { hcpLow, hcpHigh, female, senior };
  })();

  const quickLinks = [
    { icon: Trophy, label: t('home.viewRankings'), path: '/ranquings' },
    { icon: BarChart3, label: t('home.viewStats'), path: '/estadistiques' },
    { icon: Calendar, label: t('home.calendar', 'Calendari'), path: '/jornades' },
  ];

  const categories = [
    { key: 'hcpLow', label: 'HCP Baix' },
    { key: 'hcpHigh', label: 'HCP Alt' },
    { key: 'female', label: t('categories.female') },
    { key: 'senior', label: t('categories.senior') },
  ];

  const renderCategoryList = (players: typeof categoryResults.hcpLow) => {
    if (!players?.length) return <p className="text-muted-foreground text-sm py-4">{t('common.noData')}</p>;
    return (
      <div className="space-y-0">
        {players.map((p, i) => (
          <Link
            key={p.playerId}
            to={`/jugadors/${p.playerId}`}
            className="flex items-center justify-between py-3 border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors -mx-1 px-1 rounded"
          >
            <div className="flex items-center gap-3">
              <span className={`text-xs font-mono w-5 ${i < 3 ? 'text-accent font-bold' : 'text-muted-foreground'}`}>{i + 1}</span>
              <span className="text-sm font-medium">{p.name}</span>
              {p.handicap != null && (
                <span className="text-[11px] text-muted-foreground font-mono">({p.handicap})</span>
              )}
            </div>
            <span className="font-mono font-bold text-sm text-primary">{p.totalPoints} pts</span>
          </Link>
        ))}
      </div>
    );
  };

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="relative overflow-hidden bg-primary py-24 lg:py-32">
        <div className="absolute inset-0">
          <img src={heroBg} alt="" className="w-full h-full object-cover opacity-40" />
        </div>
        <div className="absolute inset-0 bg-primary/60" />
        <div className="container relative text-center">
          <p className="text-primary-foreground/50 text-xs font-medium tracking-[0.25em] uppercase mb-6">
            {t('common.season')} 2026
          </p>
          <img 
            src={logo} 
            alt="Circuit Gastronòmic Golf" 
            className="h-16 md:h-20 lg:h-24 w-auto mx-auto mb-5 brightness-0 invert"
          />
          <p className="text-primary-foreground/70 text-lg md:text-xl max-w-xl mx-auto leading-relaxed">
            {t('home.subtitle')}
          </p>
          <div className="mt-12 pt-6 border-t border-white/10 px-4">
            <div className="max-w-3xl mx-auto bg-white/85 rounded-md px-6 py-4">
              <img 
                src={sponsors} 
                alt="Patrocinadors" 
                className="w-full object-contain"
              />
            </div>
          </div>
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

      {/* Featured round + Rankings by category */}
      <section className="container pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Featured Round — clickable */}
          <Card className="border-border/40 lg:col-span-2">
            <CardContent className="p-7">
              <h3 className="font-display text-lg font-semibold mb-5 tracking-tight bg-primary text-primary-foreground -mx-7 -mt-7 px-7 py-3 rounded-t-lg">
                {nextRound ? t('home.nextRound') : t('home.lastRound')}
              </h3>
              {featuredRound ? (
                <Link to="/jornades" className="block group">
                  <div className="space-y-3">
                    <p className="text-xl font-bold text-foreground tracking-tight group-hover:text-primary transition-colors">
                      {featuredRound.name}
                      {featuredRound.is_master && (
                        <span className="ml-2 text-[10px] bg-accent/15 text-accent px-2.5 py-0.5 rounded font-semibold uppercase tracking-wider">Master</span>
                      )}
                    </p>
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Calendar className="h-4 w-4" strokeWidth={1.5} />
                      <span>{format(new Date(featuredRound.date), 'dd MMMM yyyy', { locale })}</span>
                    </div>
                    {featuredRound.club && (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <MapPin className="h-4 w-4" strokeWidth={1.5} />
                        <span>{featuredRound.club}{featuredRound.course ? ` — ${featuredRound.course}` : ''}</span>
                      </div>
                    )}
                    {featuredRound.sponsor && (
                      <p className="text-xs text-muted-foreground/70 mt-1 tracking-wide">
                        {t('rounds.sponsor')}: {featuredRound.sponsor}
                      </p>
                    )}
                    <div className="flex items-center gap-1 text-xs text-accent font-medium pt-2 group-hover:gap-2 transition-all">
                      Veure resultats <ChevronRight className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </Link>
              ) : (
                <p className="text-muted-foreground text-sm">{t('common.noData')}</p>
              )}
            </CardContent>
          </Card>

          {/* Top classified by category */}
          <Card className="border-border/40 lg:col-span-3">
            <CardContent className="p-7">
              <div className="flex items-center justify-between mb-5 bg-primary -mx-7 -mt-7 px-7 py-3 rounded-t-lg">
                <h3 className="font-display text-lg font-semibold tracking-tight bg-primary text-primary-foreground">{t('home.topPlayers')}</h3>
                <Link to="/ranquings" className="text-xs text-accent font-medium hover:underline flex items-center gap-1">
                  Veure rànquings <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              <Tabs defaultValue="hcpLow">
                <TabsList className="h-auto gap-1 flex-wrap mb-4">
                  {categories.map(cat => (
                    <TabsTrigger key={cat.key} value={cat.key} className="text-xs">
                      {cat.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {categories.map(cat => (
                  <TabsContent key={cat.key} value={cat.key}>
                    {renderCategoryList((categoryResults as any)[cat.key])}
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default Index;
