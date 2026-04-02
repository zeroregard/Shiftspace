import { create } from 'zustand';

interface PackageStore {
  selectedPackage: string;
  availablePackages: string[];
  setSelectedPackage: (pkg: string) => void;
  setAvailablePackages: (packages: string[]) => void;
}

export const usePackageStore = create<PackageStore>((set) => ({
  selectedPackage: '',
  availablePackages: [],

  setSelectedPackage: (pkg) => set({ selectedPackage: pkg }),
  setAvailablePackages: (packages) => set({ availablePackages: packages }),
}));
