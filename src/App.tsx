import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import '@/i18n';
import Layout from "./components/layout/Layout";
import Index from "./pages/Index";
import Rankings from "./pages/Rankings";
import Rounds from "./pages/Rounds";
import Players from "./pages/Players";
import Compare from "./pages/Compare";
import Stats from "./pages/Stats";
import News from "./pages/News";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Index />} />
            <Route path="/ranquings" element={<Rankings />} />
            <Route path="/jornades" element={<Rounds />} />
            <Route path="/jugadors" element={<Players />} />
            <Route path="/comparador" element={<Compare />} />
            <Route path="/estadistiques" element={<Stats />} />
            <Route path="/noticies" element={<News />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
