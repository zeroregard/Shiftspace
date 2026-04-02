import React, { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useShiftspaceStore } from '../store';
import { Codicon } from '../ui/Codicon';

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

    const filtered = availablePackages.filter((p) =>
      p.toLowerCase().includes(filter.toLowerCase())
    );

    const handleSelect = (pkg: string) => {
      onSetPackage?.(pkg);
      setOpen(false);
      setFilter('');
    };

    return (
      <Popover.Root
        open={open}
        onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (isOpen && availablePackages.length === 0) {
            onDetectPackages?.();
          }
          if (!isOpen) setFilter('');
        }}
      >
        <Popover.Trigger asChild>
          <button
            className="flex items-center gap-1 px-1.5 py-1 rounded border border-border-dashed text-text-muted hover:text-text-primary hover:border-border-default text-10 whitespace-nowrap cursor-pointer bg-transparent transition-colors"
            aria-label="Select package"
          >
            <Codicon name="package" size={11} />
            <span>{selectedPackage || 'All packages'}</span>
            <Codicon name="chevron-down" size={9} />
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            className="z-50 min-w-[160px] max-w-[240px] bg-node-file border border-border-dashed rounded-lg shadow-lg overflow-hidden animate-popover-open"
            sideOffset={4}
            align="start"
          >
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
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }
);
PackageSwitcher.displayName = 'PackageSwitcher';
