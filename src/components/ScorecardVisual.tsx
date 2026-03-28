import React from 'react';

const DEFAULT_PAR = [4, 4, 5, 3, 5, 3, 4, 4, 4, 4, 5, 3, 4, 5, 4, 4, 3, 5];

interface ScorecardVisualProps {
  scores: number[];
  par?: number[];
  handicap?: number[];
}

const ScorecardVisual: React.FC<ScorecardVisualProps> = ({ scores, par = DEFAULT_PAR, handicap }) => {
  const front9 = scores.slice(0, 9);
  const back9 = scores.slice(9, 18);
  const frontPar = par.slice(0, 9);
  const backPar = par.slice(9, 18);
  const frontHcp = handicap?.slice(0, 9);
  const backHcp = handicap?.slice(9, 18);

  const frontTotal = front9.reduce((s, v) => s + v, 0);
  const backTotal = back9.reduce((s, v) => s + v, 0);

  const renderScore = (score: number, holePar: number) => {
    if (score === 0) return <span className="text-muted-foreground/40">—</span>;

    const diff = score - holePar;

    if (diff <= -2) {
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border-2 border-primary text-primary font-bold text-xs">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-primary">
            {score}
          </span>
        </span>
      );
    }

    if (diff === -1) {
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border-2 border-primary text-primary font-bold text-xs">
          {score}
        </span>
      );
    }

    if (diff === 0) {
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 border-2 border-foreground/60 text-foreground font-semibold text-xs">
          {score}
        </span>
      );
    }

    if (diff === 1) {
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 bg-muted border border-border text-foreground font-semibold text-xs">
          {score}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center justify-center w-7 h-7 bg-destructive/15 border border-destructive/30 text-destructive font-bold text-xs">
        {score}
      </span>
    );
  };

  const renderHalf = (halfScores: number[], halfPar: number[], startHole: number, total: number, halfHcp?: number[]) => (
    <table className="text-xs">
      <thead>
        <tr>
          <td className="pr-2 py-1 text-muted-foreground font-medium w-12">Forat</td>
          {halfScores.map((_, i) => (
            <td key={i} className="text-center py-1 w-9 font-mono text-muted-foreground">{startHole + i}</td>
          ))}
          <td className="text-center py-1 w-10 font-mono font-bold text-muted-foreground">Tot</td>
        </tr>
        <tr className={halfHcp ? '' : 'border-b border-border/40'}>
          <td className="pr-2 py-1 text-muted-foreground/60 font-medium">Par</td>
          {halfPar.map((p, i) => (
            <td key={i} className="text-center py-1 font-mono text-muted-foreground/60">{p}</td>
          ))}
          <td className="text-center py-1 font-mono text-muted-foreground/60 font-bold">{halfPar.reduce((a, b) => a + b, 0)}</td>
        </tr>
        {halfHcp && (
          <tr className="border-b border-border/40">
            <td className="pr-2 py-1 text-muted-foreground/60 font-medium">HCP</td>
            {halfHcp.map((h, i) => (
              <td key={i} className="text-center py-1 font-mono text-muted-foreground/60">{h}</td>
            ))}
            <td className="text-center py-1"></td>
          </tr>
        )}
      </thead>
      <tbody>
        <tr>
          <td className="pr-2 py-2 font-medium text-foreground">Cops</td>
          {halfScores.map((s, i) => (
            <td key={i} className="text-center py-2">
              {renderScore(s, halfPar[i])}
            </td>
          ))}
          <td className="text-center py-2 font-mono font-bold text-foreground text-sm">{total || '—'}</td>
        </tr>
      </tbody>
    </table>
  );

  return (
    <div className="space-y-2">
      {renderHalf(front9, frontPar, 1, frontTotal, frontHcp)}
      {renderHalf(back9, backPar, 10, backTotal, backHcp)}
      <div className="flex items-center gap-4 pt-2 border-t border-border/40">
        <span className="text-sm font-bold">Total: <span className="text-primary text-lg">{frontTotal + backTotal}</span></span>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground ml-auto">
          <span className="inline-flex items-center gap-1">
            <span className="w-4 h-4 rounded-full border-2 border-primary inline-block" /> Birdie
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-4 h-4 border-2 border-foreground/60 inline-block" /> Par
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-4 h-4 bg-muted border border-border inline-block" /> Bogey
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-4 h-4 bg-destructive/15 border border-destructive/30 inline-block" /> Doble+
          </span>
        </div>
      </div>
    </div>
  );
};

export default ScorecardVisual;
