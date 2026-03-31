import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from 'lucide-react';

const News = () => {
  const { t } = useTranslation();

  const { data: news, isLoading } = useQuery({
    queryKey: ['public-news'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('news_drafts')
        .select('*, rounds(name, course, date)')
        .eq('status', 'published')
        .order('published_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: newsPhotos } = useQuery({
    queryKey: ['news-photos'],
    queryFn: async () => {
      const { data } = await supabase
        .from('photos')
        .select('*')
        .eq('type', 'news')
        .order('sort_order');
      return data ?? [];
    },
  });

  const getPhotosForRound = (roundId: string) =>
    newsPhotos?.filter(p => p.round_id === roundId) ?? [];

  return (
    <div className="container py-8 lg:py-12 animate-fade-in">
      <h1 className="font-display text-3xl font-bold mb-2">{t('news.title')}</h1>
      <p className="text-muted-foreground mb-8">{t('common.season')} 2026</p>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <Card key={i} className="border-border/60 animate-pulse">
              <CardHeader><div className="h-6 bg-muted rounded w-2/3" /></CardHeader>
              <CardContent><div className="h-20 bg-muted rounded" /></CardContent>
            </Card>
          ))}
        </div>
      ) : !news?.length ? (
        <Card className="border-border/60">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('common.noData')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {news.map((article) => {
            const photos = getPhotosForRound(article.round_id);
            const round = article.rounds as any;
            return (
              <Card key={article.id} className="border-border/60 overflow-hidden">
                {photos.length > 0 && (
                  <div className="relative h-48 md:h-64 overflow-hidden">
                    <img
                      src={photos[0].url}
                      alt={photos[0].caption || article.title || ''}
                      className="w-full h-full object-cover"
                    />
                    {photos.length > 1 && (
                      <Badge className="absolute bottom-3 right-3 bg-background/80 text-foreground backdrop-blur-sm">
                        +{photos.length - 1} fotos
                      </Badge>
                    )}
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Calendar className="h-3 w-3" />
                    {article.published_at
                      ? new Date(article.published_at).toLocaleDateString('ca-ES', {
                          day: 'numeric', month: 'long', year: 'numeric'
                        })
                      : ''}
                    {round && (
                      <>
                        <span className="mx-1">·</span>
                        <span>{round.name}</span>
                      </>
                    )}
                  </div>
                  <CardTitle className="text-xl font-display">{article.title}</CardTitle>
                  {article.subtitle && (
                    <p className="text-sm text-muted-foreground mt-1">{article.subtitle}</p>
                  )}
                </CardHeader>
                <CardContent>
                  <div
                    className="prose prose-sm max-w-none text-foreground/90"
                    dangerouslySetInnerHTML={{ __html: article.body?.replace(/\n/g, '<br/>') || '' }}
                  />
                  {photos.length > 1 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                      {photos.slice(1).map(photo => (
                        <img
                          key={photo.id}
                          src={photo.url}
                          alt={photo.caption || ''}
                          className="w-full h-24 object-cover rounded-md"
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default News;
