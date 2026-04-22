import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Calendar, Newspaper } from 'lucide-react';

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
    <div className="animate-fade-in">
      <section className="container pt-6 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <Newspaper className="h-5 w-5 text-accent/70" strokeWidth={1.5} />
          <h1 className="font-display text-2xl font-semibold text-foreground">{t('news.title')}</h1>
        </div>
        <p className="text-[11px] font-body text-muted-foreground tracking-wide mb-6">
          {t('common.season')} 2026
        </p>
      </section>

      <section className="container pb-14">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => (
              <div key={i} className="border border-border/50 bg-card/30 p-6 animate-pulse">
                <div className="h-5 bg-muted/30 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : !news?.length ? (
          <div className="border border-border/50 bg-card/30 py-12 text-center">
            <p className="text-muted-foreground text-sm">{t('common.noData')}</p>
          </div>
        ) : (
          <div className="border border-border/50 bg-card/30">
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
                  <AccordionItem key={article.id} value={article.id} className="border-border/30 px-5">
                    <AccordionTrigger className="hover:no-underline py-4">
                      <div className="flex flex-col items-start text-left gap-1 flex-1 pr-4">
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70 font-body tracking-wide uppercase">
                          <Calendar className="h-3 w-3" />
                          {dateStr}
                          {round && (
                            <>
                              <span>·</span>
                              <span>{round.name}</span>
                            </>
                          )}
                        </div>
                        <h2 className="font-display text-base sm:text-lg font-semibold text-foreground">
                          {article.title}
                        </h2>
                        {article.subtitle && (
                          <p className="text-[11px] text-muted-foreground/60 font-body">
                            {article.subtitle}
                          </p>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-6">
                      {photos.length > 0 && (
                        <div className="relative h-48 md:h-64 overflow-hidden mb-4">
                          <img
                            src={photos[0].url}
                            alt={photos[0].caption || article.title || ''}
                            className="w-full h-full object-cover"
                          />
                          {photos.length > 1 && (
                            <span className="absolute bottom-3 right-3 text-[9px] px-2 py-0.5 border border-background/40 bg-background/70 text-foreground font-body font-medium tracking-[0.1em] uppercase backdrop-blur-sm">
                              +{photos.length - 1} fotos
                            </span>
                          )}
                        </div>
                      )}
                      <div
                        className="prose prose-sm max-w-none text-foreground/90 font-body"
                        dangerouslySetInnerHTML={{ __html: article.body?.replace(/\n/g, '<br/>') || '' }}
                      />
                      {photos.length > 1 && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                          {photos.slice(1).map(photo => (
                            <img
                              key={photo.id}
                              src={photo.url}
                              alt={photo.caption || ''}
                              className="w-full h-24 object-cover"
                            />
                          ))}
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        )}
      </section>
    </div>
  );
};

export default News;
