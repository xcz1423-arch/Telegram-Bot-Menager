import React, { useEffect, useState } from 'react';
import { Check, Copy, AlertCircle, CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import type { ToastMessage } from '../../types';

export function StatusBadge({
  status,
  label,
}: {
  status: 'success' | 'warning' | 'danger' | 'neutral' | 'accent';
  label: string;
}) {
  const styles = {
    success: 'bg-[#20C997]/12 text-[#118A66] dark:text-[#20C997] border-[#20C997]/25',
    warning: 'bg-[#F5B942]/15 text-[#9A6807] dark:text-[#F5B942] border-[#F5B942]/30',
    danger: 'bg-[#F05B75]/12 text-[#C72544] dark:text-[#F05B75] border-[#F05B75]/25',
    accent: 'bg-[#6555E8]/12 text-[#5243D6] dark:text-[#988DF9] border-[#7565F6]/25',
    neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800/80 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  }[status];

  const Icon =
    status === 'success'
      ? CheckCircle2
      : status === 'warning'
      ? AlertTriangle
      : status === 'danger'
      ? AlertCircle
      : Info;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-md border whitespace-nowrap shrink-0 ${styles}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard denial
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : label}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] text-xs font-medium rounded-lg border border-[#E8EAF1] dark:border-slate-700/80 bg-white dark:bg-[#101421] text-[#171A2B] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-[#20C997]" /> : <Copy className="w-3.5 h-3.5" />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-xl',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-xs p-0 md:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div
        className={`relative w-full ${maxWidth} max-h-[92vh] flex flex-col bg-white dark:bg-[#151B2B] text-[#171A2B] dark:text-slate-100 rounded-t-3xl md:rounded-2xl border border-[#E8EAF1] dark:border-slate-800 shadow-2xl overflow-hidden`}
      >
        <div className="md:hidden w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-2.5 shrink-0" />
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[#E8EAF1] dark:border-slate-800 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold truncate">{title}</h2>
            {subtitle && <p className="text-xs text-[#73798C] dark:text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="min-h-[44px] min-w-[44px] -mr-2 -my-2 flex items-center justify-center rounded-xl text-[#73798C] hover:text-[#171A2B] dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-md">
      <p className="text-sm text-[#73798C] dark:text-slate-300 leading-relaxed">{message}</p>
      <div className="flex items-center justify-end gap-3 mt-6">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 min-h-[44px] text-sm font-medium rounded-xl border border-[#E8EAF1] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onConfirm}
          className={`px-4 py-2.5 min-h-[44px] text-sm font-medium text-white rounded-xl transition-colors disabled:opacity-50 ${
            danger
              ? 'bg-[#F05B75] hover:bg-[#d9455f]'
              : 'bg-[#6555E8] dark:bg-[#7565F6] hover:bg-[#5747d4]'
          }`}
        >
          {loading ? 'Processing...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4 border border-dashed border-[#E8EAF1] dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-[#101421]/60">
      <div className="w-11 h-11 rounded-xl bg-[#6555E8]/10 dark:bg-[#7565F6]/15 text-[#6555E8] dark:text-[#7565F6] flex items-center justify-center mb-3">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-sm font-semibold text-[#171A2B] dark:text-slate-100">{title}</h3>
      <p className="text-xs text-[#73798C] dark:text-slate-400 max-w-sm mt-1">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 min-h-[40px] text-xs font-medium text-white bg-[#6555E8] dark:bg-[#7565F6] hover:bg-[#5646d5] rounded-xl transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-12 rounded-xl bg-slate-200/70 dark:bg-slate-800/60 animate-pulse"
        />
      ))}
    </div>
  );
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="fixed top-3.5 left-3.5 right-3.5 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:w-[400px] z-[60] flex flex-col gap-2.5 pointer-events-none"
    >
      {toasts.map((t) => {
        const accentClass =
          t.type === 'success'
            ? 'bg-[#20C997]'
            : t.type === 'error'
            ? 'bg-[#F05B75]'
            : 'bg-[#22C8F6]';
        const iconBgClass =
          t.type === 'success'
            ? 'bg-[#20C997]/12 text-[#118A66] dark:text-[#20C997]'
            : t.type === 'error'
            ? 'bg-[#F05B75]/12 text-[#C72544] dark:text-[#F05B75]'
            : 'bg-[#22C8F6]/12 text-[#0D8FB8] dark:text-[#22C8F6]';

        return (
          <div
            key={t.id}
            role="status"
            data-testid="toast-notification"
            className="xc-toast-enter pointer-events-auto relative overflow-hidden flex items-start gap-3 pl-4 pr-3 py-3 rounded-2xl bg-white/95 dark:bg-[#151B2B]/95 backdrop-blur-md border border-[#E8EAF1] dark:border-slate-700/90 shadow-[0_14px_34px_rgba(9,11,20,0.18)]"
          >
            <span className={`absolute left-0 top-0 bottom-0 w-1 ${accentClass}`} aria-hidden="true" />
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${iconBgClass}`}>
              {t.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
              {t.type === 'error' && <AlertCircle className="w-4 h-4" />}
              {t.type === 'info' && <Info className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-xs font-semibold text-[#171A2B] dark:text-slate-100 leading-snug">{t.title}</p>
              {t.description && (
                <p className="text-xs text-[#73798C] dark:text-slate-400 mt-0.5 break-words leading-relaxed">
                  {t.description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss notification"
              className="text-[#73798C] hover:text-[#171A2B] dark:text-slate-400 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
