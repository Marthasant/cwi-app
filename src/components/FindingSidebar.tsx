import React, { useRef, useState } from 'react';
import { X, Camera, MapPin, Trash2, Cloud, CheckCircle } from 'lucide-react';
import { useInspection } from '../context/InspectionContext';
import { CriticalityLevel } from '../types/index';
import { uploadFindingPhoto } from '../lib/api';

export const FindingSidebar: React.FC = () => {
  const {
    findings,
    activeFindingId,
    setActiveFindingId,
    updateFinding,
    deleteFinding,
    saveFinding,
    buildingId,
  } = useInspection();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [photoStatus, setPhotoStatus] = useState<'idle' | 'uploading' | 'done'>('idle');

  const finding = findings.find(f => f.id === activeFindingId);

  if (!finding) return null;

  // ---- Photo handling -------------------------------------------------------
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    // Show local preview immediately
    const objectUrl = URL.createObjectURL(file);
    updateFinding(finding.id, { photoUrl: objectUrl });

    // Push to cloud if connected
    if (buildingId) {
      setPhotoStatus('uploading');
      const publicUrl = await uploadFindingPhoto(buildingId, finding.id, objectUrl);
      if (publicUrl) {
        updateFinding(finding.id, { photoUrl: publicUrl });
        setPhotoStatus('done');
      } else {
        setPhotoStatus('idle');
      }
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
            {photoStatus === 'uploading' && (
              <span className="ml-2 text-xs text-sky-400 animate-pulse font-normal">Uploading…</span>
            )}
            {photoStatus === 'done' && (
              <span className="ml-2 text-xs text-emerald-400 font-normal">✓ Synced</span>
            )}
          </label>
          {finding.photoUrl ? (
            <div className="relative group rounded-lg overflow-hidden border border-slate-600">
              <img src={finding.photoUrl} alt="Finding" className="w-full h-48 object-cover" />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  onClick={removePhoto}
                  className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full shadow-lg"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-32 border-2 border-dashed border-slate-600 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:text-brand-amber hover:border-brand-amber cursor-pointer transition-colors"
            >
              <Camera size={28} className="mb-2" />
              <span className="text-sm">Click to upload photo</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={handlePhotoUpload}
              />
            </div>
          )}
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
          disabled={saveStatus !== 'idle'}
          className={`flex-1 py-2.5 font-semibold rounded-lg shadow-md transition-all ${
            saveStatus === 'saved'
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
