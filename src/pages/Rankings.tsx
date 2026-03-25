import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const Rankings = () => {
  const { t } = useTranslation();

  const categories = [
    { key: 'hcpLow', label: t('categories.hcpLow') },
    { key: 'hcpHigh', label: t('categories.hcpHigh') },
    { key: 'scratch', label: t('categories.scratch') },
    { key: 'female', label: t('categories.female') },
    { key: 'senior', label: t('categories.senior') },
  ];

  return (
    <div className="container py-8 lg:py-12 animate-fade-in">
      <h1 className="font-display text-3xl font-bold mb-2">{t('rankings.title')}</h1>
      <p className="text-muted-foreground mb-8">{t('rankings.generalClassification')} — {t('common.season')} 2026</p>

      <Tabs defaultValue="hcpLow">
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
              <CardHeader>
                <CardTitle className="text-lg">{cat.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">{t('common.noData')}</p>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default Rankings;
