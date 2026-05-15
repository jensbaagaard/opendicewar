"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
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
    const h = round2(0.15 + rng.next() * 0.7); // bias away from extremes for varied play
    out.push({ heuristic: h, aggressive: round2(1 - h) });
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export default function PlayPage() {
  const [seed, setSeed] = useState<number>(1);
  useEffect(() => {
    setSeed(randomSeed());
  }, []);

  const initial = useMemo(
    () => newGame({ seed, playerCount: PLAYER_COUNT, territoryCount: 30 }),
    [seed],
  );
  const weights = useMemo(() => generateWeights(seed, PLAYER_COUNT), [seed]);

  const opponents = useMemo<Array<Agent | null>>(() => {
    return weights.map((w, i) => {
      if (i === HUMAN || w === null) return null;
      return makeBlendedBot(w, `P${i}`);
    });
  }, [weights]);

  const [state, setState] = useState<GameState>(initial);
  const [selected, setSelected] = useState<TerritoryId | null>(null);
  const [animation, setAnimation] = useState<RollAnimation | null>(null);

  if (state.seed !== seed) {
    setState(initial);
    setSelected(null);
    setAnimation(null);
  }

  const moves = legalAttacks(state);
  const legalTargetsFromSelected = useMemo(() => {
    const set = new Set<TerritoryId>();
    if (selected === null) return set;
    for (const m of moves) if (m.from === selected) set.add(m.to);
    return set;
  }, [moves, selected]);

  const attack = (from: TerritoryId, to: TerritoryId) => {
    if (animation) return;
    const src = state.territories[from];
    const dst = state.territories[to];
    if (!src || !dst) return;
    const fromColor = state.players[src.owner]!.color;
    const toColor = state.players[dst.owner]!.color;

    const next = applyAttack(state, from, to);
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
    setState(next);
  };

  // Bot driver — fires only when no animation is in flight.
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (animation) return;
    if (state.phase !== "attack") return;
    if (state.currentPlayer === HUMAN) return;
    const agent = opponents[state.currentPlayer];
    if (!agent) return;
    const action = agent.chooseAction(state);
    botTimerRef.current = setTimeout(() => {
      if (action.kind === "endTurn") {
        setState((s) => (s === state ? applyEndTurn(s) : s));
      } else {
        attack(action.from, action.to);
      }
    }, BOT_THINK_MS);
    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, animation, opponents]);

  const onTerritoryClick = (tid: TerritoryId) => {
    if (animation) return;
    if (state.phase !== "attack") return;
    if (state.currentPlayer !== HUMAN) return;
    const t = state.territories[tid];
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
    if (animation) return;
    if (state.currentPlayer !== HUMAN) return;
    setSelected(null);
    setState(applyEndTurn(state));
  };

  const humanAlive = state.players[HUMAN]?.alive;
  const winner = state.phase === "ended" ? state.players.find((p) => p.alive) : null;

  return (
    <main className="play-shell">
      <div className="topbar">
        <span style={{ opacity: 0.6, fontSize: "0.85rem" }}>
          Turn {state.turn} · seed {state.seed}
        </span>
        <button className="btn ghost small" onClick={() => setSeed(randomSeed())}>
          New game
        </button>
      </div>

      <div className="game-row">
        <Board
          state={state}
          selected={selected}
          legalTargets={legalTargetsFromSelected}
          onTerritoryClick={onTerritoryClick}
          animation={animation}
          onAnimationComplete={() => setAnimation(null)}
        />
        <Legend state={state} weights={weights} humanId={HUMAN} />
      </div>

      <PlayerBar state={state} />

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
            disabled={!!animation || state.currentPlayer !== HUMAN || !humanAlive}
          >
            END TURN
          </button>
        )}
      </div>
    </main>
  );
}
