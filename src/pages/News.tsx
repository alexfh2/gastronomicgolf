import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const News = () => {
  const { t } = useTranslation();

  return (
    <div className="container py-8 lg:py-12 animate-fade-in">
      <h1 className="font-display text-3xl font-bold mb-2">{t('news.title')}</h1>
      <p className="text-muted-foreground mb-8">{t('common.season')} 2026</p>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-lg">{t('news.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{t('common.noData')}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default News;
