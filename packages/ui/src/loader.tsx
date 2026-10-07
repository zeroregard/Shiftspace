import { loaderMarkup } from './loader-markup';

interface LoaderProps {
  /** Rendered width/height in px (default: 32) */
  size?: number;
}

export function Loader({ size = 32 }: LoaderProps) {
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      dangerouslySetInnerHTML={{ __html: loaderMarkup(size) }}
    />
  );
}
