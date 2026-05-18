"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Action,
  AttackAction,
  GameState,
  TerritoryId,
  applyAttack,
  applyEndTurn,
  createRng,
  legalAttacks,
  newGame,
} from "@opendicewar/core";
import { Agent, BlendWeights, makeBlendedBot } from "@opendicewar/ai";
import { Board, RollAnimation } from "../../components/Board";
import { PlayerBar } from "../../components/PlayerBar";
import { Legend } from "../../components/Legend";
import { HistoryBar } from "../../components/HistoryBar";
import { KnockoutSplash, KnockoutEvent } from "../../components/KnockoutSplash";
import { GameEndOverlay } from "../../components/GameEndOverlay";
import { ReinforceFx, ReinforceEvent } from "../../components/ReinforceFx";
import { TurnBanner } from "../../components/TurnBanner";
import { TournamentBar } from "../../components/TournamentBar";
import { MatchWonSplash, MatchWonEvent } from "../../components/MatchWonSplash";
import { TournamentEndOverlay } from "../../components/TournamentEndOverlay";
import { BracketView } from "../../components/BracketView";
import {
  BRACKET_REROLLS_PER_MATCH,
  BracketState,
  ROUND_LABELS,
  applyHumanLoss,
  applyHumanWin,
  generateBracket,
  humanOpponent,
} from "../../components/bracket";

const HUMAN: number = 0;
const PLAYER_COUNT = 7;
const BOT_THINK_MS = 120;

function randomSeed(): number {
  return (Math.random() * 0x7fffffff) >>> 0;
}

/** Per-opponent blend weights, derived deterministically from the game seed. */
function generateWeights(seed: number, playerCount: number): Array<BlendWeights | null> {
  const rng = createRng((seed ^ 0xa5a5a5a5) >>> 0);
  const out: Array<BlendWeights | null> = [];
  for (let i = 0; i < playerCount; i++) {
    if (i === HUMAN) {
      out.push(null);
      continue;
    }
    const h = round2(0.15 + rng.next() * 0.7);
    const political = rng.next() < 0.5 ? round2(0.1 + rng.next() * 0.3) : 0;
    out.push({ heuristic: h, aggressive: round2(1 - h), political });
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type NavigableAction = Extract<Action, { kind: "attack" | "endTurn" }>;

/**
 * Reinforce actions are recorded but produced as a side effect of applyEndTurn,
 * so they're not replayable on their own. The slider steps over attack + endTurn.
 */
function isNavigable(a: Action): a is NavigableAction {
  return a.kind === "attack" || a.kind === "endTurn";
}

function applyNavigable(state: GameState, action: NavigableAction): GameState {
  if (action.kind === "attack") return applyAttack(state, action.from, action.to);
  return applyEndTurn(state);
}

function SeedInput({
  seed,
  onSubmit,
}: {
  seed: number;
  onSubmit: (next: number) => void;
}) {
  const [value, setValue] = useState<string>(String(seed));
  useEffect(() => {
    setValue(String(seed));
  }, [seed]);
  const commit = () => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      setValue(String(seed));
      return;
    }
    const next = (n >>> 0) || 1;
    if (next !== seed) onSubmit(next);
    else setValue(String(seed));
  };
  return (
    <input
      className="seed-input"
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={(e) => setValue(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setValue(String(seed));
          e.currentTarget.blur();
        }
      }}
      onFocus={(e) => e.currentTarget.select()}
      aria-label="Game seed"
    />
  );
}

/** Reads ?seed=N from the URL. Returns null if absent or invalid. */
function readSeedParam(): number | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("seed");
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return (n >>> 0) || 1;
}

/** ?fast=1 → bots act with no think delay. Used for E2E test runs. */
function readFastParam(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("fast") === "1";
}

/** ?mode=tournament → 8-battle gauntlet with rerolls. */
function readTournamentParam(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("mode") === "tournament";
}

/** ?naval=1 → coastal +1 range across one hex of water. */
function readNavalParam(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("naval") === "1";
}

const HUMAN_COLOR_FALLBACK = "#ffd54f";

function buildBracket(active: boolean, seed: number, color: string): BracketState {
  const fresh = generateBracket(seed, color);
  return { ...fresh, active };
}

export default function PlayPage() {
  const [seed, setSeed] = useState<number>(1);
  const [fastBots, setFastBots] = useState<boolean>(false);
  const [navalAttacks, setNavalAttacks] = useState<boolean>(false);
  // matchSeed pins the in-game bot personalities for the current bracket
  // match. Rerolls only swap `seed` (map + dice RNG); matchSeed stays put,
  // so the player faces the same opponents on the new map.
  const [matchSeed, setMatchSeed] = useState<number>(1);
  const [bracket, setBracket] = useState<BracketState>(() =>
    buildBracket(false, 1, HUMAN_COLOR_FALLBACK),
  );
  const [matchWonEvent, setMatchWonEvent] = useState<MatchWonEvent | null>(null);
  const [bracketOpen, setBracketOpen] = useState<boolean>(false);
  const matchWonIdRef = useRef(0);
  const matchResolvedRef = useRef(false);
  const autoStartRef = useRef(false);
  useEffect(() => {
    const initSeed = readSeedParam() ?? randomSeed();
    setSeed(initSeed);
    setMatchSeed(initSeed);
    setFastBots(readFastParam());
    setNavalAttacks(readNavalParam());
    setBracket(
      buildBracket(readTournamentParam(), initSeed, HUMAN_COLOR_FALLBACK),
    );
  }, []);

  const initial = useMemo(
    () =>
      newGame({
        seed,
        playerCount: PLAYER_COUNT,
        territoryCount: 32,
        gridWidth: 32,
        gridHeight: 32,
        cellsPerTerritory: 24,
        navalAttacks,
      }),
    [seed, navalAttacks],
  );
  // Bot personalities are pinned to matchSeed, not the map seed, so rerolling
  // the map doesn't shuffle the AI lineup mid-match. Outside tournament mode
  // matchSeed simply follows seed (see the seed-change reset block below).
  const weights = useMemo(() => generateWeights(matchSeed, PLAYER_COUNT), [matchSeed]);

  const opponents = useMemo<Array<Agent | null>>(() => {
    return weights.map((w, i) => {
      if (i === HUMAN || w === null) return null;
      return makeBlendedBot(w, `P${i}`);
    });
  }, [weights]);

  const [live, setLive] = useState<GameState>(initial);
  const [selected, setSelected] = useState<TerritoryId | null>(null);
  const [animation, setAnimation] = useState<RollAnimation | null>(null);
  // null = follow live tail; otherwise absolute navigable-action index in [0..totalSteps].
  const [viewCount, setViewCount] = useState<number | null>(null);
  const [started, setStarted] = useState<boolean>(false);
  const [knockoutQueue, setKnockoutQueue] = useState<KnockoutEvent[]>([]);
  const [endDismissed, setEndDismissed] = useState<boolean>(false);
  const [reinforceFx, setReinforceFx] = useState<ReinforceEvent | null>(null);
  const [turnTrigger, setTurnTrigger] = useState<number>(0);
  const koIdRef = useRef(0);
  const fxKeyRef = useRef(0);
  // Snapshot of the viewed state at last effect run, for forward-transition diffs.
  const snapRef = useRef<{
    step: number;
    alive: boolean[];
    histLen: number;
    humanTurn: boolean;
  }>({
    step: 0,
    alive: initial.players.map((p) => p.alive),
    histLen: initial.history.length,
    humanTurn: false,
  });

  if (live.seed !== seed || live.navalAttacks !== navalAttacks) {
    setLive(initial);
    setSelected(null);
    setAnimation(null);
    setViewCount(null);
    setStarted(autoStartRef.current);
    autoStartRef.current = false;
    setKnockoutQueue([]);
    setEndDismissed(false);
    setReinforceFx(null);
    setTurnTrigger(0);
    matchResolvedRef.current = false;
    // Outside a tournament, the seed input governs everything — keep matchSeed
    // synced so weights regenerate with the map.
    if (!bracket.active && matchSeed !== seed) setMatchSeed(seed);
    snapRef.current = {
      step: 0,
      alive: initial.players.map((p) => p.alive),
      histLen: initial.history.length,
      humanTurn: false,
    };
  }

  const consumeKnockout = useCallback((id: number) => {
    setKnockoutQueue((q) => q.filter((t) => t.id !== id));
  }, []);

  // Expose state on window for E2E tests (Playwright). Read-only snapshot of
  // the live state plus a programmatic end-turn for the human player so tests
  // don't have to mouse-click the button.
  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as unknown as { __dicewar: unknown }).__dicewar = {
      state: live,
      humanId: HUMAN,
      /** Returns the post-reinforce state (synchronously) or null if not legal. */
      endTurn: () => {
        if (live.currentPlayer !== HUMAN) return null;
        if (live.phase !== "attack") return null;
        const next = applyEndTurn(live);
        setLive(next);
        return next;
      },
    };
  }, [live]);

  const navigableActions = useMemo<NavigableAction[]>(
    () => live.history.filter(isNavigable),
    [live.history],
  );
  const totalSteps = navigableActions.length;
  const isLive = viewCount === null;
  const effectiveStep = isLive ? totalSteps : Math.min(viewCount, totalSteps);

  // Replay cache: extends forward when possible; restarts on backward jumps or seed change.
  const replayCacheRef = useRef<{ initial: GameState; count: number; state: GameState }>({
    initial,
    count: 0,
    state: initial,
  });
  const viewedState = useMemo<GameState>(() => {
    if (isLive) return live;
    const cache = replayCacheRef.current;
    let count = cache.count;
    let state = cache.state;
    if (cache.initial !== initial || effectiveStep < count) {
      count = 0;
      state = initial;
    }
    while (count < effectiveStep) {
      state = applyNavigable(state, navigableActions[count]!);
      count++;
    }
    replayCacheRef.current = { initial, count, state };
    return state;
  }, [isLive, live, initial, effectiveStep, navigableActions]);

  // Unified FX driver: fires on forward single-step transitions of viewedState.
  // Covers both live-tail growth and history scrubbing; backward / multi-step
  // jumps silently re-sync the snapshot without firing FX.
  useEffect(() => {
    const prev = snapRef.current;
    const newAlive = viewedState.players.map((p) => p.alive);
    const newHistLen = viewedState.history.length;
    const newHumanTurn =
      started &&
      viewedState.currentPlayer === HUMAN &&
      viewedState.phase === "attack" &&
      !!viewedState.players[HUMAN]?.alive;
    const forwardOne = effectiveStep === prev.step + 1;

    if (forwardOne) {
      // Knockouts: alive[i] flipped true → false since last step.
      const newEvents: KnockoutEvent[] = [];
      for (let i = 0; i < newAlive.length; i++) {
        if (prev.alive[i] && !newAlive[i]) {
          newEvents.push({
            id: ++koIdRef.current,
            playerId: i,
            color: viewedState.players[i]!.color,
            isHuman: i === HUMAN,
          });
        }
      }
      if (newEvents.length > 0) {
        setKnockoutQueue((q) => [...q, ...newEvents]);
      }

      // Reinforce: walk history entries appended since last step.
      for (let i = prev.histLen; i < newHistLen; i++) {
        const a = viewedState.history[i]!;
        if (a.kind === "reinforce" && a.player === HUMAN) {
          const total = a.placements.reduce((s, p) => s + p.added, 0);
          if (total > 0) {
            setReinforceFx({
              count: total,
              color: viewedState.players[HUMAN]?.color ?? "#ffd54f",
              key: ++fxKeyRef.current,
            });
          }
        }
      }
    }

    // Turn banner: fire on humanTurn false → true regardless of step delta,
    // so the BEGIN click also produces a sweep when the human is up first.
    if (newHumanTurn && !prev.humanTurn) {
      setTurnTrigger((k) => k + 1);
    }

    snapRef.current = {
      step: effectiveStep,
      alive: newAlive,
      histLen: newHistLen,
      humanTurn: newHumanTurn,
    };
  }, [effectiveStep, viewedState, started]);

  // Reset end-overlay dismissal when the viewer steps off the final state.
  useEffect(() => {
    if (viewedState.phase !== "ended") setEndDismissed(false);
  }, [viewedState.phase]);

  // Bracket: resolve the human's current match the moment its outcome is
  // decided. Win = only the human remains alive (or live.phase ended with
  // human winner). Loss = the human is knocked out (bots may still be
  // fighting, but the human's run is over the moment they're eliminated).
  useEffect(() => {
    if (!bracket.active) return;
    if (!started) return;
    if (matchResolvedRef.current) return;
    if (bracket.outcome !== "playing") return;

    const humanAlive = live.players[HUMAN]?.alive ?? false;
    const aliveCount = live.players.filter((p) => p.alive).length;
    const humanWon =
      humanAlive && (live.phase === "ended" || aliveCount === 1);
    const humanLost = !humanAlive;
    if (!humanWon && !humanLost) return;

    matchResolvedRef.current = true;

    if (humanLost) {
      setBracket((b) => applyHumanLoss(b));
      return;
    }

    // Match won. Compute the advanced bracket synchronously so the splash can
    // preview the next opponent before we actually advance the state.
    const beaten = humanOpponent(bracket);
    const advanced = applyHumanWin(bracket, seed);
    const isChampion = advanced.outcome === "champion";
    const nextOpp = isChampion ? null : humanOpponent(advanced);
    const beatenColor = beaten?.color ?? "#fff";
    const humanColor = live.players[HUMAN]?.color ?? HUMAN_COLOR_FALLBACK;

    if (isChampion) {
      setBracket(advanced);
      return;
    }

    setMatchWonEvent({
      id: ++matchWonIdRef.current,
      roundLabel: ROUND_LABELS[bracket.currentRound] ?? "Round",
      beatenOpponentName: beaten?.name ?? "Opponent",
      beatenOpponentEmblem: beaten?.emblem ?? "?",
      beatenOpponentColor: beatenColor,
      nextRoundLabel: ROUND_LABELS[advanced.currentRound] ?? null,
      nextOpponentName: nextOpp?.name ?? null,
      nextOpponentEmblem: nextOpp?.emblem ?? null,
      nextOpponentColor: nextOpp?.color ?? null,
      color: humanColor,
    });
  }, [bracket, started, live, seed]);

  const advanceMatch = useCallback(() => {
    setMatchWonEvent(null);
    setBracket((b) => applyHumanWin(b, seed));
    // Next match starts in the pre-BEGIN state so the player can use rerolls
    // (or scout the bracket) before committing.
    autoStartRef.current = false;
    setMatchSeed(randomSeed());
    setSeed(randomSeed());
  }, [seed]);

  const restartTournament = useCallback(() => {
    const newSeed = randomSeed();
    setBracket(buildBracket(true, newSeed, HUMAN_COLOR_FALLBACK));
    setMatchWonEvent(null);
    autoStartRef.current = false;
    setMatchSeed(newSeed);
    setSeed(newSeed);
  }, []);

  const exitTournament = useCallback(() => {
    const newSeed = randomSeed();
    setBracket(buildBracket(false, newSeed, HUMAN_COLOR_FALLBACK));
    setMatchWonEvent(null);
    autoStartRef.current = false;
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("mode");
      window.history.replaceState(null, "", url.toString());
    }
    setMatchSeed(newSeed);
    setSeed(newSeed);
  }, []);

  // Rerolls are a pre-match decision: scout the map, reroll if you don't like
  // it, then BEGIN to commit. Once a match is underway, the reroll is locked.
  const canReroll =
    bracket.active &&
    bracket.outcome === "playing" &&
    !started &&
    !animation &&
    isLive &&
    bracket.rerollsLeft > 0;

  const onReroll = useCallback(() => {
    if (!canReroll) return;
    setBracket((b) => ({
      ...b,
      rerollsLeft: b.rerollsLeft - 1,
      rerollsUsed: b.rerollsUsed + 1,
    }));
    // Stay in the pre-BEGIN state on the new map so the player can keep
    // scouting and reroll again if they still don't like the layout.
    autoStartRef.current = false;
    setSeed(randomSeed());
  }, [canReroll]);

  const moves = useMemo(() => legalAttacks(viewedState), [viewedState]);
  const legalTargetsFromSelected = useMemo(() => {
    const set = new Set<TerritoryId>();
    if (selected === null) return set;
    for (const m of moves) if (m.from === selected) set.add(m.to);
    return set;
  }, [moves, selected]);

  const attack = (from: TerritoryId, to: TerritoryId) => {
    if (animation || !isLive || !started) return;
    const src = live.territories[from];
    const dst = live.territories[to];
    if (!src || !dst) return;
    const fromColor = live.players[src.owner]!.color;
    const toColor = live.players[dst.owner]!.color;

    const next = applyAttack(live, from, to);
    if (!fastBots) {
      const lastAction = next.history[next.history.length - 1] as AttackAction;
      setAnimation({
        from,
        to,
        fromColor,
        toColor,
        fromDiceBefore: src.dice,
        toDiceBefore: dst.dice,
        atkRolls: lastAction.rolls.atk,
        defRolls: lastAction.rolls.def,
        result: lastAction.result,
      });
    }
    setLive(next);
  };

  // Bot driver — only when at live tail, not animating, and no knockout splash
  // is queued. The splash pauses for animation, so without this gate the bot's
  // next attack would re-trigger the animation/splash race and the splash would
  // never get to consume its event.
  const knockoutPending = knockoutQueue.length > 0;
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!started) return;
    if (!isLive) return;
    if (animation) return;
    if (knockoutPending) return;
    if (live.phase !== "attack") return;
    if (live.currentPlayer === HUMAN) return;
    const agent = opponents[live.currentPlayer];
    if (!agent) return;
    const action = agent.chooseAction(live);
    botTimerRef.current = setTimeout(() => {
      if (action.kind === "endTurn") {
        setLive((s) => (s === live ? applyEndTurn(s) : s));
      } else {
        attack(action.from, action.to);
      }
    }, fastBots ? 0 : BOT_THINK_MS);
    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, animation, opponents, isLive, started, knockoutPending]);

  const onTerritoryClick = (tid: TerritoryId) => {
    if (animation || !isLive || !started || knockoutPending) return;
    if (live.phase !== "attack") return;
    if (live.currentPlayer !== HUMAN) return;
    const t = live.territories[tid];
    if (!t) return;

    if (selected !== null && legalTargetsFromSelected.has(tid)) {
      attack(selected, tid);
      setSelected(null);
      return;
    }
    if (t.owner === HUMAN && t.dice >= 2) {
      setSelected(selected === tid ? null : tid);
      return;
    }
    setSelected(null);
  };

  const onEndTurn = () => {
    if (animation || !isLive || !started || knockoutPending) return;
    if (live.currentPlayer !== HUMAN) return;
    setSelected(null);
    setLive(applyEndTurn(live));
  };

  const seekTo = (step: number) => {
    const target = Math.max(0, Math.min(totalSteps, step));
    setSelected(null);
    if (target === effectiveStep) return;

    // Single forward step into an attack → replay its shake/reveal animation
    // using the recorded rolls. `viewedState` here is the pre-step state.
    if (target === effectiveStep + 1) {
      const action = navigableActions[effectiveStep];
      if (action?.kind === "attack") {
        const src = viewedState.territories[action.from];
        const dst = viewedState.territories[action.to];
        if (src && dst) {
          setAnimation({
            from: action.from,
            to: action.to,
            fromColor: viewedState.players[src.owner]!.color,
            toColor: viewedState.players[dst.owner]!.color,
            fromDiceBefore: src.dice,
            toDiceBefore: dst.dice,
            atkRolls: action.rolls.atk,
            defRolls: action.rolls.def,
            result: action.result,
          });
        } else {
          setAnimation(null);
        }
      } else {
        setAnimation(null);
      }
    } else {
      setAnimation(null);
    }

    setViewCount(target === totalSteps ? null : target);
  };
  const backToLive = () => {
    setSelected(null);
    setViewCount(null);
  };

  // Keyboard navigation: ←/→ step, Home/End jump.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekTo(effectiveStep - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seekTo(effectiveStep + 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        seekTo(0);
      } else if (e.key === "End") {
        e.preventDefault();
        seekTo(totalSteps);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStep, totalSteps]);

  const humanAlive = live.players[HUMAN]?.alive;
  const liveWinner = live.phase === "ended" ? live.players.find((p) => p.alive) ?? null : null;
  const viewedWinner =
    viewedState.phase === "ended" ? viewedState.players.find((p) => p.alive) ?? null : null;
  const showEndOverlay = viewedWinner !== null && !animation && !endDismissed;

  const tournamentEnded =
    bracket.active && bracket.outcome !== "playing";
  const showRegularEnd =
    !bracket.active && showEndOverlay && viewedWinner !== null;
  const opponent = bracket.active ? humanOpponent(bracket) : null;
  const totalRounds = bracket.rounds.length;

  return (
    <main className="play-shell">
      <div className="topbar">
        <span className="topbar-info">
          <span>Turn {viewedState.turn}</span>
          {!bracket.active && (
            <>
              <span aria-hidden>·</span>
              <label className="seed-label">
                seed <SeedInput seed={seed} onSubmit={setSeed} />
              </label>
            </>
          )}
          {!isLive && <span className="viewing-history">· Viewing history</span>}
        </span>
        {!bracket.active && (
          <span className="topbar-actions">
            <Link href="/" className="btn ghost small" aria-label="Back to main menu">
              ← Menu
            </Link>
            <button className="btn ghost small" onClick={() => setSeed(randomSeed())}>
              New game
            </button>
          </span>
        )}
      </div>

      {bracket.active && (
        <>
          <TournamentBar
            roundIndex={bracket.currentRound}
            totalRounds={totalRounds}
            opponent={opponent}
            rerollsLeft={bracket.rerollsLeft}
            maxRerolls={BRACKET_REROLLS_PER_MATCH}
            canReroll={canReroll}
            onReroll={onReroll}
            onQuit={exitTournament}
          />
          <div className="tour-bracket-toggle-wrap">
            <button
              type="button"
              className="btn ghost small tour-bracket-toggle"
              onClick={() => setBracketOpen((v) => !v)}
              aria-expanded={bracketOpen}
            >
              {bracketOpen ? "Hide bracket ▴" : "Show bracket ▾"}
            </button>
          </div>
          {bracketOpen && (
            <div className="tour-bracket-panel">
              <BracketView bracket={bracket} />
            </div>
          )}
        </>
      )}

      <div className="game-row">
        <div className="board-wrap">
          <Board
            state={viewedState}
            selected={isLive ? selected : null}
            legalTargets={isLive ? legalTargetsFromSelected : new Set()}
            onTerritoryClick={onTerritoryClick}
            animation={animation}
            onAnimationComplete={() => setAnimation(null)}
          />
          <PlayerBar state={viewedState} />
          {!started && (
            <div className="begin-overlay">
              <button className="btn begin-btn" onClick={() => setStarted(true)}>
                BEGIN
              </button>
            </div>
          )}
          {started && (
            <>
              <TurnBanner trigger={turnTrigger} />
              <ReinforceFx event={reinforceFx} />
            </>
          )}
        </div>
        <Legend state={viewedState} weights={weights} humanId={HUMAN} />
      </div>

      <KnockoutSplash
        queue={knockoutQueue}
        paused={!!animation}
        onConsume={consumeKnockout}
      />

      {bracket.active && (
        <MatchWonSplash
          event={matchWonEvent}
          paused={!!animation || tournamentEnded}
          onConsume={() => advanceMatch()}
        />
      )}

      {showRegularEnd && viewedWinner && (
        <GameEndOverlay
          winnerColor={viewedWinner.color}
          winnerId={viewedWinner.id}
          isHumanWin={viewedWinner.id === HUMAN}
          onNewGame={() => setSeed(randomSeed())}
          onDismiss={() => setEndDismissed(true)}
        />
      )}

      {tournamentEnded && (
        <TournamentEndOverlay
          outcome={bracket.outcome === "champion" ? "champion" : "eliminated"}
          bracket={bracket}
          rerollsUsed={bracket.rerollsUsed}
          onRestart={restartTournament}
          onExit={exitTournament}
        />
      )}

      <HistoryBar
        totalSteps={totalSteps}
        currentStep={effectiveStep}
        isLive={isLive}
        actions={navigableActions}
        onSeek={seekTo}
        onBackToLive={backToLive}
      />

      <div className="play-controls">
        {liveWinner !== null && !bracket.active ? (
          <>
            <span className="play-banner">
              {liveWinner.id === HUMAN ? "YOU WIN!" : "GAME OVER"}
            </span>
            <button className="btn" onClick={() => setSeed(randomSeed())}>
              New game
            </button>
          </>
        ) : (
          <button
            className="btn"
            onClick={onEndTurn}
            disabled={
              !started ||
              !!animation ||
              !isLive ||
              live.currentPlayer !== HUMAN ||
              !humanAlive ||
              live.phase === "ended"
            }
          >
            END TURN
          </button>
        )}
      </div>
    </main>
  );
}
