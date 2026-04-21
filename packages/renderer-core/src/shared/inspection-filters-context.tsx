import { createContext, useContext } from 'react';

interface InspectionFiltersValue {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  problemsOnly: boolean;
  setProblemsOnly: (value: boolean) => void;
}

export const InspectionFiltersContext = createContext<InspectionFiltersValue>({
  searchQuery: '',
  setSearchQuery: () => {},
  problemsOnly: false,
  setProblemsOnly: () => {},
});

export function useInspectionFilters() {
  return useContext(InspectionFiltersContext);
}
