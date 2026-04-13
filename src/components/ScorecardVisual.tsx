import React from 'react';

const DEFAULT_PAR = [4, 4, 5, 3, 5, 3, 4, 4, 4, 4, 5, 3, 4, 5, 4, 4, 3, 5];

interface ScorecardVisualProps {
  scores: number[];
  par?: number[];
  handicap?: number[];
  playerHandicap?: number | null;
}

const calcPlayingHcp = (hcp: number): number => Math.round(hcp);

const calcExtraStrokes = (strokeIndex: number, playerHcp: number): number => {
  const playingHcp = calcPlayingHcp(playerHcp);
  const fullStrokes = Math.floor(playingHcp / 18);
  const remainder = playingHcp % 18;
  return fullStrokes + (strokeIndex <= remainder ? 1 : 0);
};

const calcStablefordPoints = (
  gross: number,
  holePar: number,
  strokeIndex: number,
  playerHcp: number
): number | null => {
  if (gross == null || gross === 0) return null;
  const extra = calcExtraStrokes(strokeIndex, playerHcp);
  const net = gross - extra;
  const diff = net - holePar;
  if (diff <= -3) return 5;
  if (diff === -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
};

/** Color scale for Stableford points */
const getStbStyle = (pts: number | null): string => {
  if (pts == null) return 'text-muted-foreground';
  if (pts >= 4) return 'bg-primary/20 text-primary font-bold';
  if (pts === 3) return 'bg-primary/10 text-primary font-semibold';
  if (pts === 2) return 'bg-accent/15 text-accent-foreground font-medium';
  if (pts === 1) return 'bg-muted text-muted-foreground';
  return 'bg-destructive/10 text-destructive font-medium';
};

const ScorecardVisual: React.FC<ScorecardVisualProps> = ({ scores, par = DEFAULT_PAR, handicap, playerHandicap }) => {
  const front9 = scores.slice(0, 9);
  const back9 = scores.slice(9, 18);
  const frontPar = par.slice(0, 9);
  const backPar = par.slice(9, 18);
  const frontHcp = handicap?.slice(0, 9);
  const backHcp = handicap?.slice(9, 18);

  const canCalcStableford = playerHandicap != null && handicap && handicap.length === 18;
  const playingHcp = playerHandicap != null ? calcPlayingHcp(playerHandicap) : null;

  const stablefordPoints = canCalcStableford
    ? scores.map((s, i) => calcStablefordPoints(s, par[i], handicap![i], playerHandicap!))
    : null;

  const frontStb = stablefordPoints?.slice(0, 9);
  const backStb = stablefordPoints?.slice(9, 18);

  const sumScores = (arr: number[]) => {
    const valid = arr.filter(s => s > 0);
    return valid.length === arr.length ? valid.reduce((a, b) => a + b, 0) : null;
  };

  const frontTotal = sumScores(front9);
  const backTotal = sumScores(back9);
  const hasLiftedBall = scores.some(s => s === 0);

  const sumStb = (arr: (number | null)[] | undefined) =>
    arr ? arr.reduce((s: number, v) => s + (v ?? 0), 0) : null;

  const getStrokeMarker = (holeIdx: number): number => {
    if (!canCalcStableford || !handicap) return 0;
    return calcExtraStrokes(handicap[holeIdx], playerHandicap!);
  };

  const renderScore = (score: number, holePar: number) => {
    if (score === 0) return <span className="text-muted-foreground font-semibold">—</span>;

    const diff = score - holePar;

    if (diff <= -2) {
      return (
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full border-2 border-primary text-primary font-bold text-xs">
          <span className="inline-flex items-center justify-center w-5.5 h-5.5 rounded-full border border-primary">
            {score}
          </span>
        </span>
      );
    }

    if (diff === -1) {
      return (
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full border-2 border-primary text-primary font-bold text-xs">
          {score}
        </span>
      );
    }

    if (diff === 0) {
      return (
        <span className="inline-flex items-center justify-center w-8 h-8 border-2 border-foreground/60 text-foreground font-semibold text-xs">
          {score}
        </span>
      );
    }

    if (diff === 1) {
      return (
        <span className="inline-flex items-center justify-center w-8 h-8 bg-muted border border-border text-foreground font-semibold text-xs">
          {score}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center justify-center w-8 h-8 bg-destructive/15 border border-destructive/30 text-destructive font-bold text-xs">
        {score}
      </span>
    );
  };

  const renderStrokeDots = (extraStrokes: number) => {
    if (extraStrokes === 0) return null;
    return (
      <div className="flex items-center justify-center gap-[2px] mt-0.5">
        {Array.from({ length: Math.min(extraStrokes, 3) }).map((_, i) => (
          <span
            key={i}
            className="w-[5px] h-[5px] rounded-full bg-accent inline-block"
          />
        ))}
      </div>
    );
  };

  const headerCellClass = "text-center py-1.5 px-1 font-mono text-[10px] bg-[hsl(var(--primary)/0.08)] text-muted-foreground/70 border border-border/30";
  const headerLabelClass = "py-1.5 px-2 font-medium text-[10px] bg-[hsl(var(--primary)/0.08)] text-muted-foreground/70 border border-border/30 w-14";
  const holeCellClass = "text-center py-2 px-1 font-mono text-sm font-bold bg-[hsl(var(--primary)/0.08)] text-foreground border border-border/30";
  const holeLabelClass = "py-2 px-2 font-semibold text-sm bg-[hsl(var(--primary)/0.08)] text-foreground border border-border/30 w-14";
  const resultCellClass = "text-center py-2.5 px-1 border border-border/20";
  const resultLabelClass = "py-2.5 px-2 font-medium text-xs border border-border/20 w-14";
  const totalCellClass = "text-center py-2 px-1 font-mono font-bold border border-border/30 w-12";

  const renderHalf = (
    halfScores: number[],
    halfPar: number[],
    startHole: number,
    total: number | null,
    halfHcp?: number[],
    halfStb?: (number | null)[],
    holeOffset = 0
  ) => (
    <table className="text-xs w-full border-collapse">
      <thead>
        <tr>
          <td className={holeLabelClass}>Forat</td>
          {halfScores.map((_, i) => (
            <td key={i} className={holeCellClass}>{startHole + i}</td>
          ))}
          <td className={`${holeCellClass} ${totalCellClass} bg-[hsl(var(--primary)/0.12)]`}>Tot</td>
        </tr>
        <tr>
          <td className={headerLabelClass}>Par</td>
          {halfPar.map((p, i) => (
            <td key={i} className={headerCellClass}>{p}</td>
          ))}
          <td className={`${headerCellClass} ${totalCellClass} bg-[hsl(var(--primary)/0.12)]`}>{halfPar.reduce((a, b) => a + b, 0)}</td>
        </tr>
        {halfHcp && (
          <tr>
            <td className={headerLabelClass}>HCP</td>
            {halfHcp.map((h, i) => (
              <td key={i} className={headerCellClass}>{h}</td>
            ))}
            <td className={`${headerCellClass} ${totalCellClass} bg-[hsl(var(--primary)/0.12)]`}></td>
          </tr>
        )}
      </thead>
      <tbody>
        <tr>
          <td className={`${resultLabelClass} font-semibold text-foreground`}>Cops</td>
          {halfScores.map((s, i) => (
            <td key={i} className={`${resultCellClass} bg-background`}>
              <div className="flex flex-col items-center min-h-[2.5rem] justify-center">
                {renderScore(s, halfPar[i])}
                {renderStrokeDots(getStrokeMarker(holeOffset + i))}
              </div>
            </td>
          ))}
          <td className={`${resultCellClass} ${totalCellClass} bg-muted/30 text-sm`}>
            {total != null ? total : '—'}
          </td>
        </tr>
        {halfStb && (
          <tr>
            <td className={`${resultLabelClass} font-semibold text-primary`}>Stb</td>
            {halfStb.map((pts, i) => (
              <td key={i} className={`${resultCellClass} bg-background`}>
                <span className={`inline-flex items-center justify-center w-7 h-7 rounded text-[11px] ${getStbStyle(pts)}`}>
                  {pts != null ? pts : '—'}
                </span>
              </td>
            ))}
            <td className={`${resultCellClass} ${totalCellClass} text-primary text-sm bg-muted/30`}>
              {sumStb(halfStb)}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-3">
      {renderHalf(front9, frontPar, 1, frontTotal, frontHcp, frontStb ?? undefined, 0)}
      {renderHalf(back9, backPar, 10, backTotal, backHcp, backStb ?? undefined, 9)}
      <div className="flex items-center gap-4 pt-2 border-t border-border/40 flex-wrap">
        <span className="text-xs text-muted-foreground">
          Total cops: {frontTotal != null && backTotal != null ? frontTotal + backTotal : '—'}
          {hasLiftedBall && ' (incomplet)'}
        </span>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground ml-auto flex-wrap">
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
          {canCalcStableford && (
            <span className="inline-flex items-center gap-1">
              <span className="flex gap-[2px]">
                <span className="w-[5px] h-[5px] rounded-full bg-accent inline-block" />
                <span className="w-[5px] h-[5px] rounded-full bg-accent inline-block" />
              </span>
              Punts HCP
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScorecardVisual;
