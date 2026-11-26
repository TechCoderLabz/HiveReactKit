import React, { createContext, useContext } from 'react';
import { normaliseWatermarkMode, type ImageWatermarkMode } from '../../utils/watermark';

/**
 * App-wide default for the HiveSuite image watermark. Wrap the app (or a
 * subtree) in `<ImageWatermarkProvider mode="forced">` and every kit image
 * uploader / meme generator inside it — including the comment composers that
 * HiveDetailPost, comment lists and modals render internally — uses that mode
 * unless a component gets an explicit `watermark` prop.
 */
const ImageWatermarkContext = createContext<ImageWatermarkMode>('off');

export interface ImageWatermarkProviderProps {
  mode: ImageWatermarkMode;
  children?: React.ReactNode;
}

export function ImageWatermarkProvider({ mode, children }: ImageWatermarkProviderProps) {
  return (
    <ImageWatermarkContext.Provider value={normaliseWatermarkMode(mode)}>
      {children}
    </ImageWatermarkContext.Provider>
  );
}

/** Explicit prop wins; otherwise the nearest provider; otherwise `off`. */
// eslint-disable-next-line react-refresh/only-export-components
export function useImageWatermarkMode(explicit?: ImageWatermarkMode): ImageWatermarkMode {
  const fromContext = useContext(ImageWatermarkContext);
  return explicit !== undefined ? normaliseWatermarkMode(explicit) : fromContext;
}
