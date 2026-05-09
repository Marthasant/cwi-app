import React, { useRef, useState } from 'react';
import { X, Camera, MapPin, Trash2, Cloud, CheckCircle, Loader2 } from 'lucide-react';
import { useInspection } from '../context/InspectionContext';
import { CriticalityLevel } from '../types/index';
import { supabase } from '../lib/supabase';

export const FindingSidebar: React.FC = () => {
  const {
    findings,
    activeFindingId,
    setActiveFindingId,
    updateFinding,
    deleteFinding,
    saveFinding,
  } = useInspection();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const finding = findings.find(f => f.id === activeFindingId);

  if (!finding) return null;

  // ---- Photo handling -------------------------------------------------------
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    try {
      const fileExt = file.name.split('.').pop() ?? 'jpg';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Step 1 — Upload file to Storage
      const { error: storageError } = await supabase.storage
        .from('finding_photos')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (storageError) throw storageError;

      const { data: publicUrlData } = supabase.storage
        .from('finding_photos')
        .getPublicUrl(fileName);

      const publicUrl = publicUrlData.publicUrl;

      // Step 2 — Write photo_url DIRECTLY to the DB row, bypassing React state
      // entirely. This is the only reliable way to guarantee the URL is persisted
      // before any React re-render can interfere.
      const { error: dbError } = await supabase
        .from('findings')
        .update({ photo_url: publicUrl })
        .eq('id', finding.id);

      if (dbError) {
        console.error('[FindingSidebar] Failed to save photo URL to DB:', dbError);
        alert(`Failed to save photo to database: ${dbError.message}`);
        return;
      }

      // Step 3 — Only now update local React state so the UI shows the image
      updateFinding(finding.id, { photoUrl: publicUrl });

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[FindingSidebar] Photo upload error:', err);
      alert(`Upload failed: ${message}`);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const removePhoto = () => {
    if (finding.photoUrl && finding.photoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(finding.photoUrl);
    }
    updateFinding(finding.id, { photoUrl: null });
  };

  // ---- Save -----------------------------------------------------------------
  const handleSave = async () => {
    setSaveStatus('saving');
    await saveFinding(finding.id);
    setSaveStatus('saved');
    setTimeout(() => {
      setSaveStatus('idle');
      setActiveFindingId(null);
    }, 800);
  };

  // ---- Delete ---------------------------------------------------------------
  const handleDelete = async () => {
    if (confirm('Delete this finding?')) {
      await deleteFinding(finding.id);
    }
  };

  const saveLabel = () => {
    if (isUploadingPhoto) return (
      <span className="flex items-center justify-center gap-1.5">
        <Loader2 size={14} className="animate-spin" /> Uploading…
      </span>
    );
    if (saveStatus === 'saving') return (
      <span className="flex items-center justify-center gap-1.5">
        <Cloud size={14} className="animate-pulse" /> Saving…
      </span>
    );
    if (saveStatus === 'saved') return (
      <span className="flex items-center justify-center gap-1.5">
        <CheckCircle size={14} /> Saved!
      </span>
    );
    return 'Save Changes';
  };

  return (
    <div className="absolute md:relative inset-0 md:inset-auto w-full md:w-[400px] h-full bg-dark-panel md:border-l border-dark-border flex flex-col shadow-2xl z-50 md:z-10 flex-shrink-0">
      <div className="flex items-center justify-between p-5 border-b border-dark-border bg-[#15181e]">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <MapPin size={20} className="text-brand-amber" />
          Finding #{finding.pinNumber ?? '?'} Details
        </h2>
        <button
          onClick={() => setActiveFindingId(null)}
          className="p-1 hover:bg-slate-700 rounded-md text-slate-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">

        {/* Coordinates Read-only */}
        <div className="bg-dark-bg p-3 rounded-lg border border-slate-700 flex justify-between items-center text-xs text-slate-400 font-mono">
          <span>X: {finding.x.toFixed(2)}</span>
          <span>Y: {finding.y.toFixed(2)}</span>
        </div>

        {/* Location Label */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Location Label</label>
          <input
            type="text"
            placeholder="e.g., Floor 3, Column B-4"
            className="w-full bg-dark-bg border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-brand-amber focus:ring-1 focus:ring-brand-amber transition-all"
            value={finding.locationLabel}
            onChange={(e) => updateFinding(finding.id, { locationLabel: e.target.value })}
          />
        </div>

        {/* Affected Area / Dimensions */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Affected Area / Dimensions</label>
          <input
            type="text"
            placeholder="e.g., 2 sq ft, 10 linear feet, 1 inch deep"
            className="w-full bg-dark-bg border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-brand-amber focus:ring-1 focus:ring-brand-amber transition-all"
            value={finding.affectedArea || ''}
            onChange={(e) => updateFinding(finding.id, { affectedArea: e.target.value })}
          />
        </div>

        {/* Photo Upload */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">
            Visual Evidence
          </label>

          {/* Always show the file input trigger */}
          {!finding.photoUrl && !isUploadingPhoto && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-32 border-2 border-dashed border-slate-600 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:text-brand-amber hover:border-brand-amber cursor-pointer transition-colors"
            >
              <Camera size={28} className="mb-2" />
              <span className="text-sm">Click to upload photo</span>
            </div>
          )}

          {/* Loading state */}
          {isUploadingPhoto && (
            <div className="w-full h-32 border-2 border-dashed border-sky-500/50 rounded-lg flex flex-col items-center justify-center text-sky-400 gap-2">
              <Loader2 size={28} className="animate-spin" />
              <p className="text-sm">Uploading photo to cloud…</p>
            </div>
          )}

          {/* Confirmed cloud image */}
          {finding.photoUrl && !isUploadingPhoto && (
            <div className="relative group rounded-lg overflow-hidden border border-slate-600">
              <img
                src={finding.photoUrl}
                alt="Finding"
                className="w-full h-48 object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  onClick={removePhoto}
                  className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full shadow-lg"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          )}

          {/* Hidden file input — always mounted so the ref is always valid */}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handlePhotoUpload}
          />
        </div>

        {/* Criticality Level */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Criticality Level</label>
          <select
            className="w-full bg-dark-bg border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-brand-amber focus:ring-1 focus:ring-brand-amber appearance-none"
            value={finding.criticalityLevel}
            onChange={(e) => updateFinding(finding.id, { criticalityLevel: e.target.value as CriticalityLevel })}
          >
            <option value="" disabled>Select Criticality...</option>
            {Object.values(CriticalityLevel).map((level) => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Description</label>
          <textarea
            placeholder={
              finding.criticalityLevel.includes('Level 1')
                ? 'e.g. AWS D1.1 Moment Connection failure, or AWS D1.4 Precast Embed Plate failing...'
                : finding.criticalityLevel.includes('Level 2')
                ? 'e.g. AWS D1.3 Puddle Weld failure, ACI 318 Concrete Spalling / Exposed Rebar...'
                : 'Technical finding description...'
            }
            rows={4}
            className="w-full bg-dark-bg border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-brand-amber focus:ring-1 focus:ring-brand-amber resize-none"
            value={finding.description}
            onChange={(e) => updateFinding(finding.id, { description: e.target.value })}
          />
        </div>

        {/* Recommendations */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Recommendations</label>
          <textarea
            placeholder="Corrective actions..."
            rows={3}
            className="w-full bg-dark-bg border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-brand-amber focus:ring-1 focus:ring-brand-amber resize-none"
            value={finding.recommendations}
            onChange={(e) => updateFinding(finding.id, { recommendations: e.target.value })}
          />
        </div>
      </div>

      {/* Footer / Actions */}
      <div className="p-5 border-t border-dark-border bg-[#15181e] flex gap-3">
        <button
          onClick={handleDelete}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
        >
          <Trash2 size={18} />
          <span>Delete</span>
        </button>
        <button
          onClick={handleSave}
          disabled={saveStatus !== 'idle' || isUploadingPhoto}
          className={`flex-1 py-2.5 font-semibold rounded-lg shadow-md transition-all ${
            isUploadingPhoto
              ? 'bg-sky-800 text-sky-300 cursor-wait'
              : saveStatus === 'saved'
              ? 'bg-emerald-600 text-white'
              : saveStatus === 'saving'
              ? 'bg-sky-700 text-white cursor-wait'
              : 'bg-brand-amber hover:bg-amber-600 text-black'
          }`}
        >
          {saveLabel()}
        </button>
      </div>
    </div>
  );
};
