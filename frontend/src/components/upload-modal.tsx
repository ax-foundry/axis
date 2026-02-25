'use client';

import { X, AlertCircle } from 'lucide-react';
import { useEffect, useCallback } from 'react';

import { FileUpload } from '@/components/file-upload';
import { cn } from '@/lib/utils';
import { useDataStore } from '@/stores/data-store';
import { useUIStore } from '@/stores/ui-store';

export function UploadModal() {
  const { uploadModalOpen, setUploadModalOpen } = useUIStore();
  const { data, fileName } = useDataStore();

  const hasExistingData = data.length > 0;

  const handleClose = useCallback(() => {
    setUploadModalOpen(false);
  }, [setUploadModalOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && uploadModalOpen) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [uploadModalOpen, handleClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (uploadModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [uploadModalOpen]);

  if (!uploadModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="animate-fade-in absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={cn(
          'relative mx-4 max-h-[90vh] w-full max-w-3xl overflow-auto',
          'rounded-3xl bg-white shadow-2xl',
          'animate-scale-in'
        )}
      >
        {/* Header */}
        <div className="border-border/50 sticky top-0 z-10 flex items-center justify-between rounded-t-3xl border-b bg-white px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-text-primary">
              {hasExistingData ? 'Replace Evaluation Data' : 'Upload Evaluation Data'}
            </h2>
            {hasExistingData && (
              <p className="mt-0.5 text-sm text-text-muted">Current data will be replaced</p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="rounded-xl p-2 transition-colors hover:bg-gray-100"
          >
            <X className="h-5 w-5 text-text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Warning for existing data */}
          {hasExistingData && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800">You have existing data loaded</p>
                <p className="mt-1 text-sm text-amber-700">
                  Current file: <span className="font-medium">{fileName}</span> ({data.length}{' '}
                  records)
                </p>
                <p className="mt-1 text-sm text-amber-600">
                  Uploading new data will replace the current dataset.
                </p>
              </div>
            </div>
          )}

          {/* File Upload Component */}
          <FileUpload />
        </div>
      </div>
    </div>
  );
}
