const Footer = () => {
  return (
    <footer className="border-t border-border/60 bg-primary text-primary-foreground">
      <div className="container py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="font-display text-sm">
          © {new Date().getFullYear()} Gastronomic Golf
        </p>
        <p className="text-xs opacity-70">
          Circuit privat de golf — Classificació oficial
        </p>
      </div>
    </footer>
  );
};

export default Footer;
