import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Calendar, Users, FileText } from 'lucide-react';

const AdminDashboard = () => {
  const { data: seasonCount } = useQuery({
    queryKey: ['admin-seasons-count'],
    queryFn: async () => {
      const { count } = await supabase.from('seasons').select('*', { count: 'exact', head: true });
      return count ?? 0;
    },
  });

  const { data: roundCount } = useQuery({
    queryKey: ['admin-rounds-count'],
    queryFn: async () => {
      const { count } = await supabase.from('rounds').select('*', { count: 'exact', head: true });
      return count ?? 0;
    },
  });

  const { data: playerCount } = useQuery({
    queryKey: ['admin-players-count'],
    queryFn: async () => {
      const { count } = await supabase.from('players').select('*', { count: 'exact', head: true });
      return count ?? 0;
    },
  });

  const { data: newsCount } = useQuery({
    queryKey: ['admin-news-count'],
    queryFn: async () => {
      const { count } = await supabase.from('news_drafts').select('*', { count: 'exact', head: true });
      return count ?? 0;
    },
  });

  const stats = [
    { label: 'Temporades', value: seasonCount ?? 0, icon: Trophy },
    { label: 'Jornades', value: roundCount ?? 0, icon: Calendar },
    { label: 'Jugadors', value: playerCount ?? 0, icon: Users },
    { label: 'Notícies', value: newsCount ?? 0, icon: FileText },
  ];

  return (
    <div className="animate-fade-in">
      <h1 className="font-display text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border/60">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-display font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;
