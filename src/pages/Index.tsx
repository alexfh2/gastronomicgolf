import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Trophy, BarChart3, Users, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const Index = () => {
  const { t } = useTranslation();

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

      {/* Placeholder sections */}
      <section className="container pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-border/60">
            <CardContent className="p-8 text-center">
              <h3 className="font-display text-lg font-semibold mb-2">{t('home.nextRound')}</h3>
              <p className="text-muted-foreground text-sm">{t('common.noData')}</p>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-8 text-center">
              <h3 className="font-display text-lg font-semibold mb-2">{t('home.latestNews')}</h3>
              <p className="text-muted-foreground text-sm">{t('common.noData')}</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default Index;
