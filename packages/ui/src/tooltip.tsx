import React from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';

interface Props {
  content: React.ReactNode;
  children: React.ReactNode;
  delayDuration?: number;
  /** Controlled open state. When provided, Radix ignores hover state. */
  open?: boolean;
  /** Optional className override for the tooltip content surface. */
  contentClassName?: string;
  /** Side-offset override (default: 4). */
  sideOffset?: number;
  /** Content alignment (default: Radix default, typically "center"). */
  align?: 'start' | 'center' | 'end';
}

export const TooltipProvider = RadixTooltip.Provider;

const DEFAULT_CONTENT_CLASS =
  'z-50 rounded px-2 py-1 text-10 text-text-primary bg-node-file border border-border-default shadow-md select-none animate-fade-in';

export const Tooltip = ({
  content,
  children,
  delayDuration = 300,
  open,
  contentClassName,
  sideOffset = 4,
  align,
}: Props) => (
  <RadixTooltip.Root delayDuration={delayDuration} open={open}>
    <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
    <RadixTooltip.Portal>
      <RadixTooltip.Content
        className={contentClassName ?? DEFAULT_CONTENT_CLASS}
        sideOffset={sideOffset}
        align={align}
      >
        {content}
      </RadixTooltip.Content>
    </RadixTooltip.Portal>
  </RadixTooltip.Root>
);
