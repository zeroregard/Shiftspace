import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import type { MockEngine } from '../mock/engine';
import type { AgentPersona } from '../mock/types';
import { WORKTREE_PRESETS } from '../mock/templates';

interface Props {
  engine: MockEngine;
  worktreeIds: string[];
  onReset: () => void;
  onAddWorktree: () => void;
  onRemoveWorktree: (id: string) => void;
}

const PERSONAS: AgentPersona[] = ['refactor', 'feature', 'bugfix'];
const PERSONA_LABELS: Record<AgentPersona, string> = {
  refactor: 'refactor',
  feature: 'feature',
  bugfix: 'bugfix',
};

function dbgBtn(active: boolean, small = false): string {
  return clsx(
    'flex-1 rounded-[2px] px-[6px] py-[2px] cursor-pointer font-mono border',
    small ? 'text-[9px]' : 'text-[10px]',
    active
      ? 'bg-[rgba(0,255,0,0.15)] border-[rgba(0,255,0,0.4)] text-debug-green'
      : 'bg-[rgba(0,255,0,0.05)] border-[rgba(0,255,0,0.15)] text-[rgba(0,255,0,0.6)]'
  );
}

export const ControlPanel: React.FC<Props> = ({
  engine,
  worktreeIds,
  onReset,
  onAddWorktree,
  onRemoveWorktree,
}) => {
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [agentStates, setAgentStates] = useState<Record<string, AgentPersona | null>>({});
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768);

  // Auto-collapse on mobile
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleSpeedChange = (val: number) => {
    setSpeed(val);
    engine.setSpeed(val);
  };

  const handlePause = () => {
    const next = !paused;
    setPaused(next);
    engine.setPaused(next);
  };

  const toggleAgent = (worktreeId: string, persona: AgentPersona) => {
    const current = agentStates[worktreeId];
    if (current === persona) {
      engine.stopAgent(worktreeId);
      setAgentStates((s) => ({ ...s, [worktreeId]: null }));
    } else {
      engine.startAgent(worktreeId, persona);
      setAgentStates((s) => ({ ...s, [worktreeId]: persona }));
    }
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-3 right-3 bg-[rgba(0,0,0,0.7)] border border-[rgba(0,255,0,0.3)] rounded px-2 py-1 text-debug-green font-mono text-[10px] font-bold cursor-pointer z-[1000] tracking-widest"
      >
        DEBUG
      </button>
    );
  }

  return (
    <div className="fixed bottom-3 right-3 bg-debug-bg border border-[rgba(0,255,0,0.25)] rounded-[2px] px-[10px] py-2 w-[260px] text-[rgba(0,255,0,0.8)] font-mono text-[11px] z-[1000] backdrop-blur [WebkitBackdropFilter:blur(8px)]">
      {/* Header with DEBUG badge and collapse button */}
      <div className="flex justify-between items-center mb-2 pb-[6px] border-b border-[rgba(0,255,0,0.15)]">
        <div className="flex items-center gap-[6px]">
          <span className="bg-[rgba(0,255,0,0.15)] border border-[rgba(0,255,0,0.4)] rounded-[2px] px-[5px] py-[1px] text-[9px] font-bold tracking-widest text-debug-green">
            DEBUG
          </span>
          <span className="text-[10px] text-[rgba(0,255,0,0.5)]">simulation</span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="bg-transparent border-none text-[rgba(0,255,0,0.5)] cursor-pointer text-[14px] px-[2px] leading-none"
        >
          ×
        </button>
      </div>

      {/* Speed */}
      <div className="mb-2">
        <div className="text-[9px] text-[rgba(0,255,0,0.4)] mb-[2px]">
          speed: {speed.toFixed(1)}x
        </div>
        <input
          type="range"
          min={0.1}
          max={5}
          step={0.1}
          value={speed}
          onChange={(e) => handleSpeedChange(Number(e.target.value))}
          style={{ accentColor: '#00ff00' }}
          className="w-full h-[2px]"
        />
      </div>

      {/* Pause / Reset / Add */}
      <div className="flex gap-1 mb-2">
        <button onClick={handlePause} className={dbgBtn(paused)}>
          {paused ? '▶ resume' : '⏸ pause'}
        </button>
        <button onClick={onReset} className={dbgBtn(false)}>
          ↻ reset
        </button>
        <button onClick={onAddWorktree} className={dbgBtn(false)}>
          + wt
        </button>
      </div>

      {/* Worktree agent controls */}
      <div>
        {worktreeIds.map((id) => (
          <div
            key={id}
            className="mb-1 pb-1 border-b border-[rgba(0,255,0,0.08)]"
          >
            <div className="text-[9px] text-[rgba(0,255,0,0.4)] mb-[2px]">{id}</div>
            <div className="flex gap-[3px] items-center">
              {PERSONAS.map((persona) => (
                <button
                  key={persona}
                  onClick={() => toggleAgent(id, persona)}
                  className={dbgBtn(agentStates[id] === persona, true)}
                >
                  {PERSONA_LABELS[persona]}
                </button>
              ))}
              <button onClick={() => onRemoveWorktree(id)} className={dbgBtn(false, true)}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-1 text-[9px] text-[rgba(0,255,0,0.25)]">
        {WORKTREE_PRESETS.length} presets available
      </div>
    </div>
  );
};
