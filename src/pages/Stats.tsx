import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const Stats = () => {
  const { t } = useTranslation();

  return (
    <div className="container py-8 lg:py-12 animate-fade-in">
      <h1 className="font-display text-3xl font-bold mb-2">{t('stats.title')}</h1>
      <p className="text-muted-foreground mb-8">{t('common.season')} 2026</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          t('stats.mostBirdies'), t('stats.mostPars'), t('stats.avgStableford'),
          t('stats.avgScratch'), t('stats.bestRound'), t('stats.regularity'),
        ].map((label) => (
          <Card key={label} className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-display font-bold">—</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Stats;
