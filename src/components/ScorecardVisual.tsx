import React from 'react';

const DEFAULT_PAR = [4, 4, 5, 3, 5, 3, 4, 4, 4, 4, 5, 3, 4, 5, 4, 4, 3, 5];

interface ScorecardVisualProps {
  scores: number[];
  par?: number[];
  handicap?: number[];
  playerHandicap?: number | null;
}

const calcStablefordPoints = (
  gross: number,
  holePar: number,
  strokeIndex: number,
  playerHcp: number
): number | null => {
  if (gross === 0) return null;
  const fullStrokes = Math.floor(playerHcp / 18);
  const remainder = Math.round(playerHcp % 18);
  const extraStrokes = fullStrokes + (strokeIndex <= remainder ? 1 : 0);
  const net = gross - extraStrokes;
  const diff = net - holePar;
  if (diff <= -3) return 5;
  if (diff === -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
};

const ScorecardVisual: React.FC<ScorecardVisualProps> = ({ scores, par = DEFAULT_PAR, handicap, playerHandicap }) => {
  const front9 = scores.slice(0, 9);
  const back9 = scores.slice(9, 18);
  const frontPar = par.slice(0, 9);
  const backPar = par.slice(9, 18);
  const frontHcp = handicap?.slice(0, 9);
  const backHcp = handicap?.slice(9, 18);

  const canCalcStableford = playerHandicap != null && handicap && handicap.length === 18;

  const stablefordPoints = canCalcStableford
    ? scores.map((s, i) => calcStablefordPoints(s, par[i], handicap![i], playerHandicap!))
    : null;

  const frontStb = stablefordPoints?.slice(0, 9);
  const backStb = stablefordPoints?.slice(9, 18);

  const frontTotal = front9.reduce((s, v) => s + v, 0);
  const backTotal = back9.reduce((s, v) => s + v, 0);

  const sumStb = (arr: (number | null)[] | undefined) =>
    arr ? arr.reduce((s: number, v) => s + (v ?? 0), 0) : null;

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

  const renderHalf = (
    halfScores: number[],
    halfPar: number[],
    startHole: number,
    total: number,
    halfHcp?: number[],
    halfStb?: (number | null)[]
  ) => (
    <table className="text-xs">
      <thead>
        <tr>
          <td className="pr-2 py-1 text-muted-foreground font-medium w-12">Forat</td>
          {halfScores.map((_, i) => (
            <td key={i} className="text-center py-1 w-9 font-mono text-muted-foreground">{startHole + i}</td>
          ))}
          <td className="text-center py-1 w-10 font-mono font-bold text-muted-foreground">Tot</td>
        </tr>
        <tr>
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
        {!halfHcp && <tr className="border-b border-border/40"><td colSpan={11}></td></tr>}
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
        {halfStb && (
          <tr className="border-t border-border/40">
            <td className="pr-2 py-1.5 font-medium text-primary">Stb</td>
            {halfStb.map((pts, i) => (
              <td key={i} className="text-center py-1.5 font-mono font-semibold text-primary">
                {pts != null ? pts : '—'}
              </td>
            ))}
            <td className="text-center py-1.5 font-mono font-bold text-primary text-sm">
              {sumStb(halfStb)}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );

  const totalStb = stablefordPoints ? sumStb(stablefordPoints) : null;

  return (
    <div className="space-y-2">
      {renderHalf(front9, frontPar, 1, frontTotal, frontHcp, frontStb ?? undefined)}
      {renderHalf(back9, backPar, 10, backTotal, backHcp, backStb ?? undefined)}
      <div className="flex items-center gap-4 pt-2 border-t border-border/40">
        <span className="text-sm font-bold">Total: <span className="text-primary text-lg">{frontTotal + backTotal}</span></span>
        {totalStb != null && (
          <span className="text-sm font-bold">Stableford: <span className="text-primary text-lg">{totalStb}</span></span>
        )}
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
