import { Loader } from '@shiftspace/ui/loader';
import { useTheme } from './use-theme';

export function LoaderPage() {
  useTheme();

  return (
    <div className="w-screen h-screen bg-canvas">
      <Loader />
    </div>
  );
}
