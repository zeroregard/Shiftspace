import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import type { MockEngine } from '../mock/engine';
import type { AgentPersona } from '../mock/types';

interface Props {
  engine: MockEngine;
  worktreeIds: string[];
  onReset: () => void;
  onAddWorktree: () => void;
  onRemoveWorktree: (id: string) => void;
  resolvedTheme: 'light' | 'dark';
  onToggleTheme: () => void;
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
      ? 'bg-[rgba(96,165,250,0.15)] border-[rgba(96,165,250,0.3)] text-text-primary'
      : 'bg-[rgba(128,128,128,0.06)] border-border-default text-text-muted hover:text-text-secondary hover:bg-[rgba(128,128,128,0.10)]'
  );
}

/** Sun icon (16x16) */
function SunIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

/** Moon icon (16x16) */
function MoonIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export const ControlPanel: React.FC<Props> = ({
  engine,
  worktreeIds,
  onReset,
  onAddWorktree,
  onRemoveWorktree,
  resolvedTheme,
  onToggleTheme,
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
        className="fixed bottom-3 left-3 bg-debug-bg border border-border-default rounded-lg px-2.5 py-1.5 text-text-muted text-10 cursor-pointer z-1000 backdrop-blur-sm hover:text-text-primary transition-colors"
      >
        Controls
      </button>
    );
  }

  return (
    <div className="fixed bottom-3 left-3 bg-debug-bg border border-border-default rounded-xl px-3 py-2.5 w-65 text-text-muted text-11 z-1000 backdrop-blur-sm">
      {/* Header with badge, theme toggle, and collapse button */}
      <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-border-default">
        <div className="flex items-center gap-1.5">
          <span className="bg-[rgba(96,165,250,0.12)] border border-[rgba(96,165,250,0.25)] rounded-md px-1.5 py-0.5 text-[9px] text-[rgba(96,165,250,0.8)] tracking-wide">
            Simulation
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleTheme}
            className="bg-transparent border-none text-text-faint cursor-pointer p-0.5 leading-none hover:text-text-primary transition-colors"
            title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="bg-transparent border-none text-text-faint cursor-pointer text-[14px] px-0.5 leading-none hover:text-text-primary transition-colors"
          >
            ×
          </button>
        </div>
      </div>

      {/* Speed */}
      <div className="mb-2.5">
        <div className="text-[9px] text-text-faint mb-1">Speed: {speed.toFixed(1)}x</div>
        <input
          type="range"
          min={0.1}
          max={5}
          step={0.1}
          value={speed}
          onChange={(e) => handleSpeedChange(Number(e.target.value))}
          style={{ accentColor: 'var(--color-teal)' }}
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
          <div key={id} className="mb-1.5 pb-1.5 border-b border-border-default/50">
            <div className="text-[9px] text-text-faint mb-1">{id}</div>
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
    </div>
  );
};
