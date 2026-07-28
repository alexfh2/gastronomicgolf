import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Calendar, Newspaper } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

type PhotoMeta = {
  id: string;
  url: string;
  caption: string | null;
  round_id: string;
  orientation: 'horizontal' | 'vertical' | 'unknown';
  ratio: number;
};

const News = () => {
  const { t } = useTranslation();
  const [lightbox, setLightbox] = useState<{ url: string; caption?: string | null } | null>(null);
  const [searchParams] = useSearchParams();
  const [openArticle, setOpenArticle] = useState<string | undefined>(undefined);

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

  const { data: rawPhotos } = useQuery({
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

  // Detect orientation per photo from natural dimensions
  const [photosMeta, setPhotosMeta] = useState<PhotoMeta[]>([]);
  useEffect(() => {
    if (!rawPhotos) return;
    let cancelled = false;
    Promise.all(
      rawPhotos.map(
        (p) =>
          new Promise<PhotoMeta>((resolve) => {
            const img = new Image();
            img.onload = () => {
              const ratio = img.naturalWidth / img.naturalHeight;
              resolve({
                id: p.id,
                url: p.url,
                caption: p.caption,
                round_id: p.round_id,
                ratio,
                orientation: ratio >= 1.2 ? 'horizontal' : 'vertical',
              });
            };
            img.onerror = () =>
              resolve({
                id: p.id,
                url: p.url,
                caption: p.caption,
                round_id: p.round_id,
                ratio: 1,
                orientation: 'unknown',
              });
            img.src = p.url;
          }),
      ),
    ).then((metas) => {
      if (!cancelled) setPhotosMeta(metas);
    });
    return () => {
      cancelled = true;
    };
  }, [rawPhotos]);
  const articleParam = searchParams.get('article');
  useEffect(() => {
    if (!articleParam || !news?.length) return;
    const target = news.find((a) => a.id === articleParam);
    if (!target) return;
    setOpenArticle(target.id);
    setTimeout(() => {
      document.getElementById(`article-${target.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
  }, [articleParam, news]);


  const getPhotosForRound = (roundId: string) =>
    photosMeta.filter((p) => p.round_id === roundId);

  return (
    <div className="animate-fade-in">
      <section className="container pt-6 pb-4">
        <div className="flex items-center gap-3 mb-1.5">
          <Newspaper className="h-5 w-5 text-accent/70" strokeWidth={1.5} />
          <h1 className="type-page-title">{t('news.title')}</h1>
        </div>
        <p className="type-page-subtitle mb-6">
          {t('common.season')} 2026
        </p>
      </section>


      <section className="container pb-14">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="border border-border/50 bg-card/30 p-6 animate-pulse">
                <div className="h-5 bg-muted/30 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : !news?.length ? (
          <div className="border border-border/50 bg-card/30 py-12 text-center">
            <p className="type-body-secondary">{t('common.noData')}</p>
          </div>
        ) : (
          <div className="border border-border/50 bg-card/30">
            <Accordion type="single" collapsible className="w-full" value={openArticle} onValueChange={setOpenArticle}>
              {news.map((article) => {
                const photos = getPhotosForRound(article.round_id);
                const headerPhoto = photos.find((p) => p.orientation === 'horizontal') ?? null;
                const coverPhoto = headerPhoto ?? photos[0] ?? null;
                const otherPhotos = headerPhoto
                  ? photos.filter((p) => p.id !== headerPhoto.id)
                  : coverPhoto
                    ? photos.filter((p) => p.id !== coverPhoto.id)
                    : photos;
                const round = article.rounds as any;
                const dateStr = article.published_at
                  ? new Date(article.published_at).toLocaleDateString('ca-ES', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
                  : '';
                return (
                  <AccordionItem
                    key={article.id}
                    value={article.id}
                    id={`article-${article.id}`}
                    className="border-border/30 px-5"
                  >
                    <AccordionTrigger className="hover:no-underline py-5">
                      <div className="flex items-start gap-3 sm:gap-4 flex-1 pr-4 text-left">
                        {coverPhoto && (
                          <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-md overflow-hidden bg-muted/20 border border-border/40">
                            <img
                              src={coverPhoto.url}
                              alt={coverPhoto.caption || article.title || ''}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="flex flex-col items-start gap-1.5 min-w-0">
                          <div className="flex items-center gap-2 type-metadata">
                            <Calendar className="h-3.5 w-3.5" />
                            {dateStr}
                            {round && (
                              <>
                                <span>·</span>
                                <span>{round.name}</span>
                              </>
                            )}
                          </div>
                          <h2 className="font-display text-[17px] sm:text-[19px] font-semibold text-foreground leading-[1.3] max-w-[46ch]">
                            {article.title}
                          </h2>
                          {article.subtitle && (
                            <p className="text-[13.5px] sm:text-[14px] leading-[1.45] text-secondary-foreground font-body line-clamp-2 max-w-[62ch]">
                              {article.subtitle}
                            </p>
                          )}

                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-6">
                      {/* Header: only shown when a horizontal photo exists. Never cropped. */}
                      {headerPhoto && (
                        <button
                          type="button"
                          onClick={() =>
                            setLightbox({ url: headerPhoto.url, caption: headerPhoto.caption })
                          }
                          className="block w-full mb-4 bg-muted/20 group"
                          aria-label="Ampliar imatge"
                        >
                          <img
                            src={headerPhoto.url}
                            alt={headerPhoto.caption || article.title || ''}
                            className="w-full h-auto max-h-[420px] object-contain mx-auto group-hover:opacity-90 transition-opacity"
                          />
                        </button>
                      )}

                      <div
                        className="prose max-w-[68ch] text-[15.5px] sm:text-[16px] leading-[1.65] text-foreground font-body prose-p:mb-4 prose-strong:text-foreground"

                        dangerouslySetInnerHTML={{
                          __html: article.body?.replace(/\n/g, '<br/>') || '',
                        }}
                      />

                      {/* Vertical / extra photos: preserve aspect ratio, clickable thumbs */}
                      {otherPhotos.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-5">
                          {otherPhotos.map((photo) => (
                            <button
                              key={photo.id}
                              type="button"
                              onClick={() =>
                                setLightbox({ url: photo.url, caption: photo.caption })
                              }
                              className="block bg-muted/20 overflow-hidden group"
                              aria-label="Ampliar imatge"
                            >
                              <img
                                src={photo.url}
                                alt={photo.caption || ''}
                                style={{ aspectRatio: photo.ratio || 1 }}
                                className="w-full h-auto object-contain group-hover:opacity-90 transition-opacity"
                              />
                            </button>
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

      {/* Lightbox */}
      <Dialog open={!!lightbox} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="max-w-5xl bg-background/95 border-border/40 p-2 sm:p-4">
          {lightbox && (
            <div className="flex flex-col items-center gap-3">
              <img
                src={lightbox.url}
                alt={lightbox.caption || ''}
                className="max-h-[80vh] w-auto h-auto object-contain"
              />
              {lightbox.caption && (
                <p className="type-metadata text-center">
                  {lightbox.caption}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default News;
