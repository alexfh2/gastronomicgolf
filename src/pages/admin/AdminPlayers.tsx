import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const AdminPlayers = () => {
  const { data: players, isLoading } = useQuery({
    queryKey: ['admin-players'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="animate-fade-in">
      <h1 className="font-display text-2xl font-bold mb-6">Jugadors</h1>

      <Card className="border-border/60">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Llicència</TableHead>
                <TableHead>Club</TableHead>
                <TableHead>Últim HCP</TableHead>
                <TableHead>Gènere</TableHead>
                <TableHead>Sènior</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Carregant...
                  </TableCell>
                </TableRow>
              ) : !players?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No hi ha jugadors registrats
                  </TableCell>
                </TableRow>
              ) : (
                players.map((player) => (
                  <TableRow key={player.id}>
                    <TableCell className="font-medium">{player.name}</TableCell>
                    <TableCell className="text-muted-foreground">{player.license}</TableCell>
                    <TableCell className="text-muted-foreground">{player.club || '—'}</TableCell>
                    <TableCell>{player.current_handicap ?? '—'}</TableCell>
                    <TableCell>
                      {player.gender === 'F' ? (
                        <Badge variant="secondary">Femenina</Badge>
                      ) : (
                        <span className="text-muted-foreground">M</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {player.is_senior ? (
                        <Badge variant="outline">Sènior</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPlayers;
