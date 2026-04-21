import { createContext, useContext } from 'react';

interface InspectionHoverValue {
  hoveredFilePath: string | null;
  setHoveredFilePath: (path: string | null) => void;
  onFileClick: (worktreeId: string, filePath: string, line?: number) => void;
}

export const InspectionHoverContext = createContext<InspectionHoverValue>({
  hoveredFilePath: null,
  setHoveredFilePath: () => {},
  onFileClick: () => {},
});

export function useInspectionHover() {
  return useContext(InspectionHoverContext);
}
