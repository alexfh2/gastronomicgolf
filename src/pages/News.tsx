import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
      <div className="bg-primary rounded-xl px-5 py-5 mb-8 shadow-md">
        <h1 className="font-display text-3xl font-bold text-primary-foreground">{t('news.title')}</h1>
        <p className="text-primary-foreground/70 mt-1">{t('common.season')} 2026</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <Card key={i} className="border-border/60 animate-pulse">
              <CardContent className="py-6"><div className="h-6 bg-muted rounded w-2/3" /></CardContent>
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
        <Card className="border-border/60">
          <Accordion type="single" collapsible className="w-full">
            {news.map((article) => {
              const photos = getPhotosForRound(article.round_id);
              const round = article.rounds as any;
              const dateStr = article.published_at
                ? new Date(article.published_at).toLocaleDateString('ca-ES', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })
                : '';
              return (
                <AccordionItem key={article.id} value={article.id} className="border-border/60 px-4 sm:px-6">
                  <AccordionTrigger className="hover:no-underline py-4">
                    <div className="flex flex-col items-start text-left gap-1 flex-1 pr-4">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {dateStr}
                        {round && (
                          <>
                            <span>·</span>
                            <span>{round.name}</span>
                          </>
                        )}
                      </div>
                      <h2 className="font-display text-lg sm:text-xl font-semibold text-foreground">
                        {article.title}
                      </h2>
                      {article.subtitle && (
                        <p className="text-sm text-muted-foreground font-normal">
                          {article.subtitle}
                        </p>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-6">
                    {photos.length > 0 && (
                      <div className="relative h-48 md:h-64 overflow-hidden rounded-lg mb-4">
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
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </Card>
      )}
    </div>
  );
};

export default News;
