import React, { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { useInspection } from '../context/InspectionContext';
import * as pdfjsLib from 'pdfjs-dist';
// Vite specific import for the worker
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export const PlanUploader: React.FC = () => {
  const { setPlanImage, setImageDimensions } = useInspection();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
      setIsLoading(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        
        // Render at a higher scale for better resolution
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        if (!context) throw new Error('Could not get canvas context');
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({
          canvasContext: context,
          viewport: viewport
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any).promise;
        
        const dataUrl = canvas.toDataURL('image/png');
        setImageDimensions({ width: canvas.width, height: canvas.height });
        setPlanImage(dataUrl);
      } catch (error) {
        console.error("Error parsing PDF:", error);
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

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      setPlanImage(objectUrl);
    };
    img.onerror = () => {
      alert('Failed to load image. Please try another file.');
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-dark-bg text-slate-300 p-8">
      <div 
        className={`w-full max-w-2xl p-12 border-2 border-dashed border-slate-600 rounded-2xl bg-dark-panel transition-colors flex flex-col items-center gap-4 shadow-xl ${isLoading ? 'opacity-50 cursor-wait' : 'hover:border-brand-amber cursor-pointer'}`}
        onClick={() => !isLoading && fileInputRef.current?.click()}
      >
        <div className="bg-slate-800 p-4 rounded-full text-brand-amber mb-2">
          {isLoading ? (
            <div className="animate-spin h-12 w-12 border-4 border-brand-amber border-t-transparent rounded-full" />
          ) : (
            <UploadCloud size={48} />
          )}
        </div>
        <h2 className="text-2xl font-semibold text-white tracking-wide">
          {isLoading ? 'Processing PDF...' : 'Upload Floor Plan'}
        </h2>
        <p className="text-slate-400 text-center text-sm max-w-md leading-relaxed">
          {isLoading 
            ? 'Converting the first page of your PDF into an interactive map canvas. Please wait...' 
            : 'Select a PNG, JPG, or PDF file of the parking garage floor plan. This will act as the canvas for your inspection.'}
        </p>
        <input 
          type="file" 
          accept="image/*,application/pdf" 
          className="hidden" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          disabled={isLoading}
        />
        {!isLoading && (
          <button className="mt-4 px-6 py-2.5 bg-brand-amber hover:bg-amber-600 text-black font-semibold rounded-lg shadow-md transition-all">
            Browse Files
          </button>
        )}
      </div>
    </div>
  );
};
