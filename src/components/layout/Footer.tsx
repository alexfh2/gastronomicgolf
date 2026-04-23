const Footer = () => {
  return (
    <footer className="border-t border-white/[0.04] mt-auto">
      <div className="container py-12 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3.5">
          <span className="crest crest-sm" aria-hidden />
          <span className="leading-none">
            <strong className="block font-display text-base font-semibold">Gastronòmic Golf</strong>
            <span className="block mt-1.5 text-[10px] text-muted-foreground uppercase" style={{ letterSpacing: '0.22em' }}>
              circuit privat · classificació oficial
            </span>
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground/70 uppercase" style={{ letterSpacing: '0.22em' }}>
          © {new Date().getFullYear()} · Premium reference
        </p>
      </div>
    </footer>
  );
};

export default Footer;
