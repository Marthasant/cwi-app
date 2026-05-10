import React, { useRef, useState } from 'react';
import { UploadCloud, Cloud, CheckCircle } from 'lucide-react';
import { useInspection } from '../context/InspectionContext';
import type { MapMode } from '../types/index';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { supabase } from '../lib/supabase';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface PlanUploaderProps {
  setMapMode: (mode: MapMode) => void;
}

export const PlanUploader: React.FC<PlanUploaderProps> = () => {
  const { setImageDimensions, buildingId, currentFloorId, updateFloor } = useInspection();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [isUploadingPlan, setIsUploadingPlan] = useState(false);

  /**
   * After the image data-URL / blob-URL is ready, upload to Supabase Storage
   * and update the floor row with the public URL (so other devices can load it).
   */
  const syncToCloud = async (blob: Blob, ext: string) => {
    if (!buildingId || !currentFloorId) return;
    setIsUploadingPlan(true);
    setUploadStatus('uploading');
    try {
      const fileName = `floor-${currentFloorId}-${Date.now()}.${ext}`;
      
      // 1. Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('floor_plans')
        .upload(fileName, blob, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: publicUrlData } = supabase.storage
        .from('floor_plans')
        .getPublicUrl(fileName);
        
      const publicUrl = publicUrlData.publicUrl;

      // 3. Direct Database Update (Bypass React State temporarily for safety)
      const { error: dbError } = await supabase
        .from('floors')
        .update({ floor_plan_url: publicUrl })
        .eq('id', currentFloorId);

      if (dbError) throw dbError;

      // 4. Update local React state (Context) ONLY after DB success
      updateFloor(currentFloorId, { planImage: publicUrl, floorPlanUrl: publicUrl });
      setUploadStatus('done');
    } catch (error: any) {
      console.error("Floor plan upload error:", error);
      alert(`Upload failed: ${error.message}`);
      setUploadStatus('idle');
    } finally {
      setIsUploadingPlan(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
      setIsLoading(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);

        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not get canvas context');

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
          canvasContext: context,
          viewport: viewport,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any).promise;

        setImageDimensions({ width: canvas.width, height: canvas.height });
        // Bypassing premature setPlanImage to wait for DB success

        // Upload to cloud: convert data-URL → blob
        canvas.toBlob(async (blob) => {
          if (blob) await syncToCloud(blob, 'png');
        }, 'image/png');

      } catch (error) {
        console.error('[PlanUploader] PDF error:', error);
        alert('Failed to parse PDF. Please try a different file.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image (PNG/JPG) or PDF file.');
      return;
    }

    // Image path
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      // Bypassing premature setPlanImage to wait for DB success
      const ext = file.type.split('/')[1] || 'png';
      await syncToCloud(file, ext);
    };
    img.onerror = () => {
      alert('Failed to load image. Please try another file.');
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  };

  const cloudStatusLabel = () => {
    if (!buildingId) return null;
    if (uploadStatus === 'uploading') return (
      <span className="flex items-center gap-1 text-xs text-sky-400 animate-pulse">
        <Cloud size={13} /> Uploading to cloud…
      </span>
    );
    if (uploadStatus === 'done') return (
      <span className="flex items-center gap-1 text-xs text-emerald-400">
        <CheckCircle size={13} /> Saved to cloud
      </span>
    );
    return null;
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-dark-bg text-slate-300 p-8">
      <div
        className={`w-full max-w-2xl p-12 border-2 border-dashed border-slate-600 rounded-2xl bg-dark-panel transition-colors flex flex-col items-center gap-4 shadow-xl ${(isLoading || isUploadingPlan) ? 'opacity-50 cursor-wait' : 'hover:border-brand-amber cursor-pointer'}`}
        onClick={() => !(isLoading || isUploadingPlan) && fileInputRef.current?.click()}
      >
        <div className="bg-slate-800 p-4 rounded-full text-brand-amber mb-2">
          {isLoading ? (
            <div className="animate-spin h-12 w-12 border-4 border-brand-amber border-t-transparent rounded-full" />
          ) : (
            <UploadCloud size={48} />
          )}
        </div>
        <h2 className="text-2xl font-semibold text-white tracking-wide">
          {isLoading ? 'Processing PDF...' : isUploadingPlan ? 'Uploading floor plan to cloud...' : 'Upload Floor Plan'}
        </h2>
        <p className="text-slate-400 text-center text-sm max-w-md leading-relaxed">
          {isLoading
            ? 'Converting the first page of your PDF into an interactive map canvas. Please wait...'
            : 'Select a PNG, JPG, or PDF file of the parking garage floor plan. This will act as the canvas for your inspection.'}
        </p>
        {cloudStatusLabel()}
        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileChange}
          disabled={isLoading || isUploadingPlan}
        />
        {!(isLoading || isUploadingPlan) && (
          <button className="mt-4 px-6 py-2.5 bg-brand-amber hover:bg-amber-600 text-black font-semibold rounded-lg shadow-md transition-all">
            Browse Files
          </button>
        )}
      </div>
    </div>
  );
};
