import React, { useEffect, useImperativeHandle, useRef, useState, useCallback } from "react";
import { Image, X, Loader2, Crop as CropIcon, EyeOff, ChevronLeft, ChevronRight, Trash2, RotateCcw, Check, AlertCircle } from "lucide-react";
import { uploadImageWithFallback, type PostingSignMessageFn } from "../../services/hiveImageUpload";
import { prepareImageForUpload, cropImage, type CropRect, type BlurRect } from "../../utils/imageProcessor";
import ImageCropperModal from "./ImageCropperModal";

/** Dig a human-readable message out of whatever an upload helper (or provider SDK) might throw. */
function extractUploadErrorMessage(err: unknown): string {
  if (err == null) return "Failed to upload image";
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    if (err.message && err.message !== "[object Object]") return err.message;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyErr = err as any;
    if (anyErr.cause) return extractUploadErrorMessage(anyErr.cause);
    if (typeof anyErr.error === "string") return anyErr.error;
    if (anyErr.error && typeof anyErr.error === "object") return extractUploadErrorMessage(anyErr.error);
  }
  if (typeof err === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyErr = err as any;
    if (typeof anyErr.message === "string" && anyErr.message !== "[object Object]") return anyErr.message;
    if (typeof anyErr.error === "string") return anyErr.error;
    if (anyErr.cmd === "sign_nack" || anyErr.cmd === "auth_nack") return "Request rejected in wallet";
    if (anyErr.cmd === "sign_err" || anyErr.cmd === "auth_err") return typeof anyErr.error === "string" ? anyErr.error : "Wallet error";
    if (anyErr.data && typeof anyErr.data.msg === "string") return anyErr.data.msg;
    try {
      const str = JSON.stringify(err);
      if (str && str !== "{}") return str;
    } catch { /* fallthrough */ }
  }
  return "Failed to upload image";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface ImageUploaderRef {
  /** Stage an image file (from drag-drop or paste) and open preview modal with crop/blur options */
  stageFile: (file: File) => Promise<void>;
  /** Stage several image files at once (multi-select / multi-drop). Opens the
   *  review wizard: arrows + thumbnails, per-image crop/blur, Next until every
   *  image has been viewed, then Upload. Non-image files are ignored. */
  stageFiles: (files: File[] | FileList) => Promise<void>;
  /** Trigger the hidden file input programmatically */
  openFileInput: () => void;
}

export interface ImageUploaderProps {
  /** Called with the uploaded image URL */
  onImageUploaded: (imageUrl: string) => void;
  /** Called once per upload run with every new URL, in the order the images
   *  appear in the batch. Prefer this for inserting markdown so all links land
   *  at the cursor in order. When omitted, onImageUploaded fires per URL. */
  onImagesUploaded?: (imageUrls: string[]) => void;
  /** Allow picking several files in the file picker (default true). */
  multiple?: boolean;
  /** ThreeSpeak user JWT token for primary image upload API */
  threeSpeakToken?: string;
  /** Encoder base URL (defaults to https://encoder.hivesuite.app) */
  encoderUrl?: string;
  /** Ecency image hosting token for upload authentication */
  ecencyToken?: string;
  /** Optional signer used when the Ecency upload fails. Signs a posting-key message. */
  onSignMessage?: PostingSignMessageFn;
  /** Hive username used for the signed images.hive.blog fallback upload. */
  signingUsername?: string;
  /** Fires true while the caller's wallet signer is running (wallet approval window). */
  onSigningStateChange?: (isSigning: boolean) => void;
  /** Text shown in blinking amber while waiting for wallet approval during the hive image fallback. */
  walletApprovalLabel?: string;
  disabled?: boolean;
  /** Cap on the longest edge of the uploaded image. Default 2048px.
   *  Photos taken on modern phones are routinely 4032px+ wide, which
   *  the upstream image hosts truncate or reject — this guarantees we
   *  always ship a sensible size. */
  maxImageDimension?: number;
}

interface BatchItem {
  id: string;
  original: File;
  staged: File;
  previewUrl: string;
  reviewed: boolean;
  status: "pending" | "uploading" | "done" | "error";
  url?: string;
  error?: string;
}

let batchSeq = 0;
/** Max images accepted in one batch. */
const MAX_BATCH = 20;

const ImageUploader = React.forwardRef<ImageUploaderRef, ImageUploaderProps>(({
  onImageUploaded,
  onImagesUploaded,
  threeSpeakToken,
  encoderUrl,
  ecencyToken,
  onSignMessage,
  signingUsername,
  onSigningStateChange,
  walletApprovalLabel = 'Open Keychain App & Approve',
  disabled = false,
  maxImageDimension,
  multiple = true,
}, ref) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const itemsRef = useRef<BatchItem[]>([]);
  itemsRef.current = items;
  const [index, setIndex] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAwaitingApproval, setIsAwaitingApproval] = useState(false);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [cropperInitialTool, setCropperInitialTool] = useState<'crop' | 'blur'>('crop');

  // Revoke every preview URL on unmount.
  useEffect(() => () => {
    itemsRef.current.forEach((it) => URL.revokeObjectURL(it.previewUrl));
  }, []);

  const cancelInFlight = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsAwaitingApproval(false);
    onSigningStateChange?.(false);
  }, [onSigningStateChange]);

  const updateItem = (id: string, patch: Partial<BatchItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const stageFiles = useCallback(async (input: File[] | FileList) => {
    const all = Array.from(input);
    const images = all.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      if (all.length > 0) setError("Please select an image file");
      return;
    }
    const tooBig = images.filter((f) => f.size > 25 * 1024 * 1024);
    // 25 MB cap on the *source* — we downsize before upload, but anything
    // bigger is almost certainly a misclick.
    let accepted = images.filter((f) => f.size <= 25 * 1024 * 1024);
    const existing = itemsRef.current.filter((it) => it.status !== "done").length;
    const room = Math.max(0, MAX_BATCH - existing);
    const skippedForCap = Math.max(0, accepted.length - room);
    accepted = accepted.slice(0, room);
    if (accepted.length === 0) {
      setError(tooBig.length ? "File size must be less than 25MB" : `You can add up to ${MAX_BATCH} images at once`);
      return;
    }
    setError(null);
    setIsProcessing(true);
    const added: BatchItem[] = [];
    const failures: string[] = [];
    for (const file of accepted) {
      try {
        const prepared = await prepareImageForUpload(file, { maxDimension: maxImageDimension });
        added.push({
          id: `img-${++batchSeq}`,
          original: file,
          staged: prepared,
          // Preview built from the *prepared* blob so it reflects what is uploaded.
          previewUrl: URL.createObjectURL(prepared),
          reviewed: false,
          status: "pending",
        });
      } catch (err) {
        failures.push(`${file.name}: ${extractUploadErrorMessage(err)}`);
      }
    }
    setIsProcessing(false);
    if (added.length) {
      const startAt = itemsRef.current.filter((it) => it.status !== "done").length;
      // Drop finished items from a previous batch before adding new ones.
      setItems((prev) => {
        const keep = prev.filter((it) => it.status !== "done");
        prev.filter((it) => it.status === "done").forEach((it) => URL.revokeObjectURL(it.previewUrl));
        const next = [...keep, ...added];
        next[keep.length] = { ...next[keep.length], reviewed: true };
        return next;
      });
      setIndex(startAt);
    }
    const notes: string[] = [];
    if (tooBig.length) notes.push(`${tooBig.length} image(s) over 25MB were skipped`);
    if (skippedForCap) notes.push(`${skippedForCap} image(s) skipped (max ${MAX_BATCH} per batch)`);
    notes.push(...failures);
    setError(notes.length ? notes.join(". ") : null);
  }, [maxImageDimension]);

  const stageFile = useCallback((file: File) => stageFiles([file]), [stageFiles]);

  useImperativeHandle(ref, () => ({
    stageFile,
    stageFiles,
    openFileInput: () => {
      if (!disabled && !isUploading) fileInputRef.current?.click();
    },
  }), [stageFile, stageFiles, disabled, isUploading]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    event.target.value = "";
    await stageFiles(list);
  };

  const current: BatchItem | undefined = items[index];

  const goTo = (i: number) => {
    if (i < 0 || i >= items.length) return;
    setIndex(i);
    setItems((prev) => prev.map((it, idx) => (idx === i && !it.reviewed ? { ...it, reviewed: true } : it)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === id);
      if (idx < 0) return prev;
      URL.revokeObjectURL(prev[idx].previewUrl);
      const next = prev.filter((it) => it.id !== id);
      const newIndex = Math.min(idx, next.length - 1);
      setIndex(Math.max(0, newIndex));
      if (next[newIndex] && !next[newIndex].reviewed) next[newIndex] = { ...next[newIndex], reviewed: true };
      return next;
    });
  };

  const handleApplyCrop = async (rect: CropRect, blurRects?: BlurRect[]) => {
    setCropperOpen(false);
    const target = current;
    if (!target) return;
    setIsProcessing(true);
    try {
      const cropped = await cropImage(target.original, rect, { maxDimension: maxImageDimension }, blurRects);
      URL.revokeObjectURL(target.previewUrl);
      updateItem(target.id, { staged: cropped, previewUrl: URL.createObjectURL(cropped), status: "pending", error: undefined, url: undefined });
    } catch (err) {
      setError(extractUploadErrorMessage(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const uploadOne = async (item: BatchItem, signal: AbortSignal): Promise<string> => {
    return uploadImageWithFallback(item.staged, {
      threeSpeakToken,
      encoderUrl,
      ecencyToken,
      onSignMessage,
      signingUsername,
      signal,
      onSignStart: () => {
        if (!signal.aborted) {
          setIsAwaitingApproval(true);
          onSigningStateChange?.(true);
        }
      },
      onSignEnd: () => {
        setIsAwaitingApproval(false);
        onSigningStateChange?.(false);
      },
    });
  };

  const resetAll = () => {
    itemsRef.current.forEach((it) => URL.revokeObjectURL(it.previewUrl));
    setItems([]);
    setIndex(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /** Upload every not-yet-uploaded item sequentially (the wallet-signing fallback
   *  can only show one approval at a time), then insert all new URLs in order. */
  const startUpload = async (onlyId?: string) => {
    const queue = itemsRef.current.filter((it) => it.status !== "done" && (!onlyId || it.id === onlyId));
    if (queue.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;
    setIsUploading(true);
    setError(null);
    const uploaded = new Map<string, string>();
    for (const item of queue) {
      if (signal.aborted) break;
      updateItem(item.id, { status: "uploading", error: undefined });
      try {
        const url = await uploadOne(item, signal);
        if (signal.aborted) break;
        uploaded.set(item.id, url);
        updateItem(item.id, { status: "done", url });
      } catch (err) {
        if (signal.aborted) break;
        console.error('[ImageUploader] upload error:', err);
        updateItem(item.id, { status: "error", error: extractUploadErrorMessage(err) });
      }
    }
    if (abortRef.current === controller) abortRef.current = null;
    if (signal.aborted) return;
    setIsUploading(false);
    // Insert in the batch's order, not completion order.
    const urls = itemsRef.current.map((it) => uploaded.get(it.id)).filter((u): u is string => !!u);
    if (urls.length) {
      if (onImagesUploaded) onImagesUploaded(urls);
      else urls.forEach((u) => onImageUploaded(u));
    }
    const anyFailed = queue.some((it) => !uploaded.has(it.id));
    if (!anyFailed) {
      resetAll();
    } else {
      const firstFailed = itemsRef.current.findIndex((it) => it.status === "error");
      if (firstFailed >= 0) setIndex(firstFailed);
    }
  };

  const clearPreview = () => {
    cancelInFlight();
    setIsUploading(false);
    setIsProcessing(false);
    resetAll();
    setError(null);
  };

  const total = items.length;
  const allReviewed = items.every((it) => it.reviewed);
  const nextUnreviewed = (() => {
    for (let k = 1; k <= total; k++) {
      const i = (index + k) % total;
      if (!items[i].reviewed) return i;
    }
    return -1;
  })();
  const pendingCount = items.filter((it) => it.status !== "done").length;
  const failedCount = items.filter((it) => it.status === "error").length;
  const doneCount = items.filter((it) => it.status === "done").length;
  const modalOpen = total > 0 || error !== null || isProcessing;

  const statusBadge = (it: BatchItem) => {
    if (it.status === "uploading") return <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--hrk-info)]" />;
    if (it.status === "done") return <Check className="h-3.5 w-3.5 text-green-400" />;
    if (it.status === "error") return <AlertCircle className="h-3.5 w-3.5 text-[var(--hrk-danger)]" />;
    return null;
  };

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || isUploading}
      />
      <button
        type="button"
        onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
        disabled={disabled || isUploading}
        className="p-2 rounded-lg hover:bg-[var(--hrk-bg-surface-raised)] text-[var(--hrk-text-tertiary)] hover:text-[var(--hrk-text-primary)] transition-colors disabled:opacity-50"
        title={multiple ? "Upload Images" : "Upload Image"}
      >
        {isUploading || isProcessing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Image className="h-4 w-4" />
        )}
      </button>
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--hrk-bg-app)] border border-[var(--hrk-border-subtle)] rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-[var(--hrk-border-subtle)]">
              <h3 className="text-lg font-semibold text-white">
                {total === 0 && error ? "Upload Error" : total > 1 ? `Images (${index + 1}/${total})` : "Image Preview"}
              </h3>
              <button type="button" onClick={clearPreview} className="p-1 hover:bg-[var(--hrk-bg-surface)] rounded" aria-label="Close">
                <X className="h-5 w-5 text-[var(--hrk-text-secondary)]" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {error && <div className="text-[var(--hrk-danger)] text-sm break-words">{error}</div>}
              {total === 0 && isProcessing && (
                <div className="text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-[var(--hrk-info)]" />
                  <p className="text-sm text-[var(--hrk-text-tertiary)]">Preparing images...</p>
                </div>
              )}
              {current && (
                <>
                  <div className="relative">
                    <img src={current.previewUrl} alt={`Preview ${index + 1}`} className="w-full max-h-64 object-contain rounded" />
                    {total > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => goTo(index - 1)}
                          disabled={index === 0 || isUploading}
                          className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white disabled:opacity-30"
                          aria-label="Previous image"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => goTo(index + 1)}
                          disabled={index === total - 1 || isUploading}
                          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white disabled:opacity-30"
                          aria-label="Next image"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </>
                    )}
                  </div>
                  {total > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {items.map((it, i) => (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => !isUploading && goTo(i)}
                          className={`relative h-14 w-14 shrink-0 overflow-hidden rounded border-2 ${i === index ? "border-[var(--hrk-brand)]" : "border-transparent"} ${it.reviewed ? "" : "opacity-50"}`}
                          title={it.reviewed ? `Image ${i + 1}` : `Image ${i + 1} (not reviewed yet)`}
                        >
                          <img src={it.previewUrl} alt="" className="h-full w-full object-cover" />
                          {statusBadge(it) && (
                            <span className="absolute bottom-0.5 right-0.5 rounded-full bg-black/70 p-0.5">{statusBadge(it)}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-[var(--hrk-text-tertiary)] text-center">
                    {current.status === "done"
                      ? "Uploaded"
                      : current.status === "error"
                        ? <span className="text-[var(--hrk-danger)]">Failed: {current.error}</span>
                        : current.original.size > current.staged.size
                          ? `Resized for upload: ${formatBytes(current.original.size)} → ${formatBytes(current.staged.size)}`
                          : `Ready to upload: ${formatBytes(current.staged.size)}`}
                  </div>
                  {isAwaitingApproval ? (
                    <div className="text-center">
                      <p className="text-sm text-[var(--hrk-warning)] animate-pulse">{walletApprovalLabel}</p>
                    </div>
                  ) : isUploading ? (
                    <div className="text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-[var(--hrk-info)]" />
                      <p className="text-sm text-[var(--hrk-text-tertiary)]">
                        {total > 1 ? `Uploading ${Math.min(doneCount + 1, total)} of ${total}...` : "Uploading image..."}
                      </p>
                    </div>
                  ) : isProcessing ? (
                    <div className="text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-[var(--hrk-info)]" />
                      <p className="text-sm text-[var(--hrk-text-tertiary)]">Preparing image...</p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      {current.status !== "done" && (
                        <>
                          <button
                            type="button"
                            onClick={() => { setCropperInitialTool('blur'); setCropperOpen(true); }}
                            className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/20 font-medium transition-colors"
                            title="Blur or hide private info (phone numbers, IDs, faces)"
                          >
                            <EyeOff className="h-3.5 w-3.5 text-cyan-400" />
                            Blur / Redact
                          </button>
                          <button
                            type="button"
                            onClick={() => { setCropperInitialTool('crop'); setCropperOpen(true); }}
                            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--hrk-border-subtle)] px-3 py-1.5 text-xs hover:bg-[var(--hrk-bg-surface)] text-[var(--hrk-text-secondary)] hover:text-[var(--hrk-text-primary)] transition-colors"
                            title="Crop and resize image"
                          >
                            <CropIcon className="h-3.5 w-3.5" />
                            Crop
                          </button>
                        </>
                      )}
                      {total > 1 && current.status !== "done" && (
                        <button
                          type="button"
                          onClick={() => removeItem(current.id)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--hrk-border-subtle)] px-3 py-1.5 text-xs hover:bg-[var(--hrk-bg-surface)] text-[var(--hrk-text-secondary)] transition-colors"
                          title="Remove this image from the batch"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      )}
                      {current.status === "error" && failedCount > 0 && (
                        <button
                          type="button"
                          onClick={() => startUpload(current.id)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--hrk-border-subtle)] px-3 py-1.5 text-xs hover:bg-[var(--hrk-bg-surface)] text-[var(--hrk-text-secondary)] transition-colors"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Retry
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={clearPreview}
                        className="rounded-md border border-[var(--hrk-border-subtle)] px-3 py-1.5 text-xs hover:bg-[var(--hrk-bg-surface)] text-[var(--hrk-text-secondary)] transition-colors"
                      >
                        Cancel
                      </button>
                      {!allReviewed && nextUnreviewed >= 0 ? (
                        <button
                          type="button"
                          onClick={() => goTo(nextUnreviewed)}
                          className="inline-flex items-center gap-1 rounded-md bg-[var(--hrk-brand)] text-black px-3.5 py-1.5 text-xs font-semibold hover:opacity-90 transition-opacity"
                        >
                          Next
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startUpload()}
                          disabled={pendingCount === 0}
                          className="rounded-md bg-[var(--hrk-brand)] text-black px-3.5 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                        >
                          {failedCount > 0 ? `Retry failed (${failedCount})` : pendingCount > 1 ? `Upload ${pendingCount}` : "Upload"}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {current && (
        <ImageCropperModal
          isOpen={cropperOpen}
          onClose={() => setCropperOpen(false)}
          src={current.previewUrl}
          initialTool={cropperInitialTool}
          onApply={handleApplyCrop}
        />
      )}
    </div>
  );
});

export default ImageUploader;
