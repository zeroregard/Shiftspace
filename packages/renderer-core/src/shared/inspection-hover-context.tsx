import { createContext, useContext } from 'react';

interface InspectionHoverValue {
  hoveredFilePath: string | null;
}

export const InspectionHoverContext = createContext<InspectionHoverValue>({
  hoveredFilePath: null,
});

export function useInspectionHover() {
  return useContext(InspectionHoverContext);
}
