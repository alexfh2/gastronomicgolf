import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import LanguageSwitcher from './LanguageSwitcher';
import logo from '@/assets/logo.png';

const navItems = [
  { key: 'overview', path: '/' },
  { key: 'rankings', path: '/ranquings' },
  { key: 'rounds', path: '/jornades' },
  { key: 'players', path: '/jugadors' },
  
  { key: 'stats', path: '/estadistiques' },
  { key: 'news', path: '/noticies' },
] as const;

const Navbar = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5">
          <img src={logo} alt="Gastronòmic Golf" className="h-10 w-auto" />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-0.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.key}
                to={item.path}
                className={`px-3 py-2 text-[13px] font-medium uppercase tracking-wider rounded-md transition-colors ${
                  isActive
                    ? 'text-white bg-primary/80'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }`}
              >
                {t(`nav.${item.key}`)}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex text-[11px] text-muted-foreground font-medium tracking-[0.15em] uppercase">
            Temporada 2026
          </span>
          <LanguageSwitcher />

          {/* Mobile menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetTitle className="flex items-center gap-2">
                <img src={logo} alt="Gastronòmic Golf" className="h-8 w-auto" />
              </SheetTitle>
              <nav className="mt-8 flex flex-col gap-0.5">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.key}
                      to={item.path}
                      onClick={() => setOpen(false)}
                      className={`px-4 py-3 text-sm font-medium uppercase tracking-wider rounded-md transition-colors ${
                        isActive
                          ? 'text-primary bg-secondary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                      }`}
                    >
                      {t(`nav.${item.key}`)}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
