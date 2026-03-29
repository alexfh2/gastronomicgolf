import logo from '@/assets/logo.png';

const Footer = () => {
  return (
    <footer className="border-t border-border/60 bg-primary text-primary-foreground">
      <div className="container py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Gastronòmic Golf" className="h-8 w-auto brightness-0 invert opacity-90" />
        </div>
        <p className="text-xs opacity-60 tracking-wide uppercase">
          Circuit privat de golf — Classificació oficial
        </p>
        <p className="text-xs opacity-40">
          © {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
};

export default Footer;
