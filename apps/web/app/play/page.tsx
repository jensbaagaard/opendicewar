"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
    out.push({ heuristic: h, aggressive: round2(1 - h) });
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Reinforce actions are recorded but produced as a side effect of applyEndTurn,
 * so they're not replayable on their own. The slider steps over attack + endTurn.
 */
function isNavigable(a: Action): boolean {
  return a.kind === "attack" || a.kind === "endTurn";
}

function applyNavigable(state: GameState, action: Action): GameState {
  if (action.kind === "attack") return applyAttack(state, action.from, action.to);
  if (action.kind === "endTurn") return applyEndTurn(state);
  return state;
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

export default function PlayPage() {
  const [seed, setSeed] = useState<number>(1);
  const [fastBots, setFastBots] = useState<boolean>(false);
  useEffect(() => {
    setSeed(readSeedParam() ?? randomSeed());
    setFastBots(readFastParam());
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
      }),
    [seed],
  );
  const weights = useMemo(() => generateWeights(seed, PLAYER_COUNT), [seed]);

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

  if (live.seed !== seed) {
    setLive(initial);
    setSelected(null);
    setAnimation(null);
    setViewCount(null);
    setStarted(false);
  }

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

  const navigableActions = useMemo<Action[]>(
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

  // Bot driver — only when at live tail and not animating.
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!started) return;
    if (!isLive) return;
    if (animation) return;
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
  }, [live, animation, opponents, isLive, started]);

  const onTerritoryClick = (tid: TerritoryId) => {
    if (animation || !isLive || !started) return;
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
    if (animation || !isLive || !started) return;
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
  const winner = live.phase === "ended" ? live.players.find((p) => p.alive) : null;

  return (
    <main className="play-shell">
      <div className="topbar">
        <span style={{ opacity: 0.6, fontSize: "0.85rem" }}>
          Turn {viewedState.turn} · seed {viewedState.seed}
          {!isLive && <span className="viewing-history">· Viewing history</span>}
        </span>
        <button className="btn ghost small" onClick={() => setSeed(randomSeed())}>
          New game
        </button>
      </div>

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
          {!started && (
            <div className="begin-overlay">
              <button className="btn begin-btn" onClick={() => setStarted(true)}>
                BEGIN
              </button>
            </div>
          )}
        </div>
        <Legend state={viewedState} weights={weights} humanId={HUMAN} />
      </div>

      <PlayerBar state={viewedState} />

      <HistoryBar
        totalSteps={totalSteps}
        currentStep={effectiveStep}
        isLive={isLive}
        actions={navigableActions}
        onSeek={seekTo}
        onBackToLive={backToLive}
      />

      <div className="play-controls">
        {winner !== undefined && winner !== null ? (
          <>
            <span className="play-banner">
              {winner.id === HUMAN ? "YOU WIN!" : "GAME OVER"}
            </span>
            <button className="btn" onClick={() => setSeed(randomSeed())}>
              New game
            </button>
          </>
        ) : (
          <button
            className="btn"
            onClick={onEndTurn}
            disabled={!started || !!animation || !isLive || live.currentPlayer !== HUMAN || !humanAlive}
          >
            END TURN
          </button>
        )}
      </div>
    </main>
  );
}
