import React from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';

interface Props {
  content: React.ReactNode;
  children: React.ReactNode;
  delayDuration?: number;
}

export const TooltipProvider = RadixTooltip.Provider;

export const Tooltip = ({ content, children, delayDuration = 300 }: Props) => (
  <RadixTooltip.Root delayDuration={delayDuration}>
    <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
    <RadixTooltip.Portal>
      <RadixTooltip.Content
        className="z-50 rounded px-2 py-1 text-10 text-text-primary bg-node-file border border-border-default shadow-md select-none animate-fade-in"
        sideOffset={4}
      >
        {content}
      </RadixTooltip.Content>
    </RadixTooltip.Portal>
  </RadixTooltip.Root>
);
