import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Copy, Download, Sparkles } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type Round = Tables<'rounds'>;

interface NewsGenerationDialogProps {
  round: Round;
  onClose: () => void;
}

interface GeneratedNews {
  title: string;
  subtitle: string;
  body: string;
  highlights: string[];
  seo_excerpt: string;
}

const NewsGenerationDialog = ({ round, onClose }: NewsGenerationDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [specialMention, setSpecialMention] = useState('');
  const [confirmSponsor, setConfirmSponsor] = useState(true);
  const [language, setLanguage] = useState<'ca' | 'es'>('ca');
  const [tone, setTone] = useState<'journalistic' | 'friendly'>('journalistic');
  const [generatedNews, setGeneratedNews] = useState<GeneratedNews | null>(null);

  // Check if news draft already exists
  const { data: existingDraft } = useQuery({
    queryKey: ['news-draft', round.id, language],
    queryFn: async () => {
      const { data } = await supabase
        .from('news_drafts')
        .select('*')
        .eq('round_id', round.id)
        .eq('language', language)
        .maybeSingle();
      return data;
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-news', {
        body: {
          round_id: round.id,
          language,
          tone,
          sponsor: confirmSponsor ? round.sponsor : null,
          special_mention: specialMention || null,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error generant la notícia');
      return data.news as GeneratedNews;
    },
    onSuccess: (news) => {
      setGeneratedNews(news);
      toast({ title: 'Notícia generada!' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!generatedNews) throw new Error('No hi ha notícia generada');

      const payload = {
        round_id: round.id,
        language,
        tone,
        title: generatedNews.title,
        subtitle: generatedNews.subtitle,
        body: generatedNews.body,
        highlights: generatedNews.highlights as any,
        seo_excerpt: generatedNews.seo_excerpt,
        special_mention: specialMention || null,
        status: 'draft',
      };

      if (existingDraft) {
        const { error } = await supabase.from('news_drafts').update(payload).eq('id', existingDraft.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('news_drafts').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-draft'] });
      toast({ title: 'Notícia guardada com a esborrany' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const copyToClipboard = () => {
    if (!generatedNews) return;
    const text = `${generatedNews.title}\n\n${generatedNews.subtitle}\n\n${generatedNews.body}`;
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiat al portapapers!' });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            Generar notícia — {round.name}
          </DialogTitle>
        </DialogHeader>

        {!generatedNews ? (
          <div className="space-y-4">
            {/* Pre-generation settings */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch checked={confirmSponsor} onCheckedChange={setConfirmSponsor} />
                <Label>
                  Mencionar patrocinador: <strong>{round.sponsor || '(cap)'}</strong>
                </Label>
              </div>

              <div className="space-y-2">
                <Label>Menció especial (opcional)</Label>
                <Input
                  value={specialMention}
                  onChange={(e) => setSpecialMention(e.target.value)}
                  placeholder="p. ex. homenatge a un jugador, agraïment especial..."
                />
              </div>

              <div className="space-y-2">
                <Label>Idioma</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={language === 'ca' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setLanguage('ca')}
                  >
                    Català
                  </Button>
                  <Button
                    type="button"
                    variant={language === 'es' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setLanguage('es')}
                  >
                    Castellà
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>To</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={tone === 'journalistic' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTone('journalistic')}
                  >
                    Periodístic-esportiu
                  </Button>
                  <Button
                    type="button"
                    variant={tone === 'friendly' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTone('friendly')}
                  >
                    Proper i amigable
                  </Button>
                </div>
              </div>
            </div>

            {existingDraft && (
              <Badge variant="outline" className="text-xs">
                Ja existeix un esborrany en {language === 'ca' ? 'català' : 'castellà'} — es sobreescriurà
              </Badge>
            )}

            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="w-full"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Generant notícia...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generar notícia
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Generated news preview */}
            <Tabs defaultValue="preview">
              <TabsList>
                <TabsTrigger value="preview">Vista prèvia</TabsTrigger>
                <TabsTrigger value="edit">Editar</TabsTrigger>
              </TabsList>

              <TabsContent value="preview" className="space-y-3">
                <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                  <h2 className="font-display text-xl font-bold">{generatedNews.title}</h2>
                  <p className="text-muted-foreground italic">{generatedNews.subtitle}</p>
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap">{generatedNews.body}</div>
                  {generatedNews.highlights?.length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Destacats:</p>
                      <ul className="text-sm space-y-1">
                        {generatedNews.highlights.map((h, i) => (
                          <li key={i}>• {h}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  <strong>SEO:</strong> {generatedNews.seo_excerpt}
                </p>
              </TabsContent>

              <TabsContent value="edit" className="space-y-3">
                <div className="space-y-2">
                  <Label>Títol</Label>
                  <Input
                    value={generatedNews.title}
                    onChange={(e) => setGeneratedNews({ ...generatedNews, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Subtítol</Label>
                  <Input
                    value={generatedNews.subtitle}
                    onChange={(e) => setGeneratedNews({ ...generatedNews, subtitle: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cos</Label>
                  <Textarea
                    value={generatedNews.body}
                    onChange={(e) => setGeneratedNews({ ...generatedNews, body: e.target.value })}
                    rows={12}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Extracte SEO</Label>
                  <Input
                    value={generatedNews.seo_excerpt}
                    onChange={(e) => setGeneratedNews({ ...generatedNews, seo_excerpt: e.target.value })}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex gap-2">
              <Button onClick={copyToClipboard} variant="outline" size="sm">
                <Copy className="h-4 w-4 mr-1" />
                Copiar
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                size="sm"
              >
                {saveMutation.isPending ? 'Guardant...' : 'Guardar esborrany'}
              </Button>
              <Button
                onClick={() => { setGeneratedNews(null); }}
                variant="ghost"
                size="sm"
              >
                Regenerar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default NewsGenerationDialog;
