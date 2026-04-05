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

function ctrlBtn(active: boolean, small = false): string {
  return clsx(
    'flex-1 rounded-md px-2 py-1 cursor-pointer border transition-colors',
    small ? 'text-[9px]' : 'text-10',
    active
      ? 'bg-[rgba(77,163,255,0.15)] border-[rgba(77,163,255,0.3)] text-[#E6EAF2]'
      : 'bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.06)] text-[#9AA4B2] hover:text-[#B8BFC9] hover:bg-[rgba(255,255,255,0.06)]'
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
        className="fixed bottom-3 left-3 bg-[rgba(20,24,32,0.85)] border border-[rgba(255,255,255,0.06)] rounded-lg px-2.5 py-1.5 text-[#9AA4B2] text-10 cursor-pointer z-1000 backdrop-blur-[8px] hover:text-[#E6EAF2] transition-colors"
      >
        Controls
      </button>
    );
  }

  return (
    <div className="fixed bottom-3 left-3 bg-[rgba(20,24,32,0.85)] border border-[rgba(255,255,255,0.06)] rounded-xl px-3 py-2.5 w-65 text-[#9AA4B2] text-11 z-1000 backdrop-blur-[8px]">
      {/* Header with badge and collapse button */}
      <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-[rgba(255,255,255,0.06)]">
        <div className="flex items-center gap-1.5">
          <span className="bg-[rgba(77,163,255,0.12)] border border-[rgba(77,163,255,0.25)] rounded-md px-1.5 py-0.5 text-[9px] text-[rgba(77,163,255,0.8)] tracking-wide">
            Simulation
          </span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="bg-transparent border-none text-[#5C6573] cursor-pointer text-[14px] px-0.5 leading-none hover:text-[#9AA4B2] transition-colors"
        >
          ×
        </button>
      </div>

      {/* Speed */}
      <div className="mb-2.5">
        <div className="text-[9px] text-[#5C6573] mb-1">Speed: {speed.toFixed(1)}x</div>
        <input
          type="range"
          min={0.1}
          max={5}
          step={0.1}
          value={speed}
          onChange={(e) => handleSpeedChange(Number(e.target.value))}
          style={{ accentColor: '#5AAFC4' }}
          className="w-full h-0.5"
        />
      </div>

      {/* Pause / Reset / Add */}
      <div className="flex gap-1.5 mb-2.5">
        <button onClick={handlePause} className={ctrlBtn(paused)}>
          {paused ? '▶ resume' : '⏸ pause'}
        </button>
        <button onClick={onReset} className={ctrlBtn(false)}>
          ↻ reset
        </button>
        <button onClick={onAddWorktree} className={ctrlBtn(false)}>
          + wt
        </button>
      </div>

      {/* Worktree agent controls */}
      <div>
        {worktreeIds.map((id) => (
          <div key={id} className="mb-1.5 pb-1.5 border-b border-[rgba(255,255,255,0.04)]">
            <div className="text-[9px] text-[#5C6573] mb-1">{id}</div>
            <div className="flex gap-1 items-center">
              {PERSONAS.map((persona) => (
                <button
                  key={persona}
                  onClick={() => toggleAgent(id, persona)}
                  className={ctrlBtn(agentStates[id] === persona, true)}
                >
                  {PERSONA_LABELS[persona]}
                </button>
              ))}
              <button onClick={() => onRemoveWorktree(id)} className={ctrlBtn(false, true)}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-1.5 text-[9px] text-[#5C6573]">
        {WORKTREE_PRESETS.length} presets available
      </div>
    </div>
  );
};
