import React, { useState, useRef, useEffect } from 'react';
import { useShiftspaceStore } from '../store';

interface PackageSwitcherProps {
  onSetPackage?: (packageName: string) => void;
  onDetectPackages?: () => void;
}

export const PackageSwitcher: React.FC<PackageSwitcherProps> = React.memo(
  ({ onSetPackage, onDetectPackages }) => {
    const selectedPackage = useShiftspaceStore((s) => s.selectedPackage);
    const availablePackages = useShiftspaceStore((s) => s.availablePackages);
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!open) return;
      const handler = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const filtered = availablePackages.filter((p) =>
      p.toLowerCase().includes(filter.toLowerCase())
    );

    const handleSelect = (pkg: string) => {
      onSetPackage?.(pkg);
      setOpen(false);
      setFilter('');
    };

    return (
      <div className="relative" ref={containerRef}>
        <button
          className="flex items-center gap-1 px-1.5 py-1 rounded border border-border-dashed text-text-muted hover:text-text-primary hover:border-border-default text-10 whitespace-nowrap cursor-pointer bg-transparent transition-colors"
          onClick={() => {
            if (!open && availablePackages.length === 0) {
              onDetectPackages?.();
            }
            setOpen((v) => !v);
          }}
          aria-label="Select package"
        >
          <i className="codicon codicon-package" style={{ fontSize: 11 }} aria-hidden="true" />
          <span>{selectedPackage || 'All packages'}</span>
          <i className="codicon codicon-chevron-down" style={{ fontSize: 9 }} aria-hidden="true" />
        </button>

        {open && (
          <div className="absolute top-full mt-1 left-0 z-50 min-w-[160px] max-w-[240px] bg-node-file border border-border-dashed rounded-lg shadow-lg overflow-hidden">
            <div className="p-1.5 border-b border-border-dashed">
              <input
                className="w-full bg-transparent text-text-primary text-11 outline-none placeholder:text-text-faint px-1"
                placeholder="Filter packages..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto py-1">
              {/* All option */}
              <button
                className="w-full text-left px-2 py-1 text-11 text-text-muted hover:bg-node-file-pulse cursor-pointer bg-transparent border-none"
                onClick={() => handleSelect('')}
              >
                All
              </button>
              {filtered.length === 0 && (
                <div className="px-2 py-1 text-11 text-text-faint">
                  {availablePackages.length === 0 ? 'No packages detected' : 'No matches'}
                </div>
              )}
              {filtered.map((pkg) => (
                <button
                  key={pkg}
                  className="w-full text-left px-2 py-1 text-11 hover:bg-node-file-pulse cursor-pointer bg-transparent border-none"
                  style={{
                    color:
                      pkg === selectedPackage
                        ? 'var(--color-status-added)'
                        : 'var(--color-text-primary)',
                  }}
                  onClick={() => handleSelect(pkg)}
                >
                  {pkg}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);
PackageSwitcher.displayName = 'PackageSwitcher';
