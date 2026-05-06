import React, { useState } from 'react';
import { InspectionProvider, useInspection } from './context/InspectionContext';
import { PlanUploader } from './components/PlanUploader';
import { MapViewer } from './components/MapViewer';
import { FindingSidebar } from './components/FindingSidebar';
import { PdfTemplates } from './components/PdfTemplates';
import { generatePdfReport } from './utils/pdfGenerator';
import { exportToExcel } from './utils/excelGenerator';
import { AlertTriangle, FileText, Trash2, MapPin, FileSpreadsheet, X } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';

const Dashboard: React.FC = () => {
  const { planImage, imageDimensions, findings, clearInspection, isAddingMode, setIsAddingMode, setActiveFindingId, projectTitle, setProjectTitle, inspectorName, setInspectorName } = useInspection();
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [certNumber, setCertNumber] = useState('');
  const [inspectionDate, setInspectionDate] = useState(() => {
    const today = new Date();
    return `${(today.getMonth() + 1).toString().padStart(2,'0')}/${today.getDate().toString().padStart(2,'0')}/${today.getFullYear()}`;
  });
  const sigPadRef = React.useRef<SignatureCanvas>(null);

  const handleGeneratePdf = async () => {
    // Guard: ensure ref is mounted
    if (!sigPadRef.current) {
      alert("Signature pad not ready. Please try again.");
      return;
    }
    // Guard: ensure signature is drawn
    if (sigPadRef.current.isEmpty()) {
      alert("Please provide a signature before generating the report.");
      return;
    }

    let signatureDataUrl: string | undefined;
    try {
      // getCanvas() is more reliable than getTrimmedCanvas() which can fail
      // when the internal canvas dimensions cause cropping edge cases
      signatureDataUrl = sigPadRef.current.getCanvas().toDataURL('image/png');
    } catch {
      alert("Could not read signature. Please clear and re-draw it.");
      return;
    }

    // Close modal and show generating state immediately
    setShowSignatureModal(false);
    setIsGenerating(true);

    try {
      await generatePdfReport(
        findings,
        projectTitle,
        inspectorName,
        planImage,
        imageDimensions,
        signatureDataUrl,
        inspectionDate,
        certNumber
      );
    } catch (error) {
      console.error("PDF generation failed:", error);
      alert(`PDF generation failed: ${error instanceof Error ? error.message : String(error)}\n\nCheck the browser console for full details.`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-dark-bg text-slate-200 overflow-hidden font-sans">
      {/* Top Navbar */}
      <header className="h-16 flex items-center justify-between px-6 bg-dark-panel border-b border-dark-border shadow-md z-20">
        <div className="flex items-center gap-3 flex-1">
          <div className="bg-brand-amber text-black p-2 rounded-lg">
            <AlertTriangle size={24} />
          </div>
          <div className="flex flex-col w-full max-w-md gap-1">
            <input 
              type="text"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              className="text-xl font-bold text-white tracking-wide bg-transparent border-b border-transparent hover:border-slate-600 focus:border-brand-amber focus:outline-none transition-colors w-full"
              placeholder="Inspection Project Title"
            />
            <input 
              type="text"
              value={inspectorName}
              onChange={(e) => setInspectorName(e.target.value)}
              className="text-xs text-brand-amber font-medium bg-transparent border-b border-transparent hover:border-slate-600 focus:border-brand-amber focus:outline-none transition-colors w-full placeholder-brand-amber/50"
              placeholder="Inspector Name"
            />
          </div>
        </div>

        {planImage && (
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                setIsAddingMode(true);
                setActiveFindingId(null);
              }}
              className={`px-4 py-2 flex items-center gap-2 rounded-lg text-sm font-bold transition-all shadow-md border ${
                isAddingMode 
                ? 'bg-brand-amber text-black border-brand-amber shadow-brand-amber/20' 
                : 'bg-dark-bg text-brand-amber border-brand-amber hover:bg-brand-amber/10'
              }`}
            >
              <MapPin size={16} />
              {isAddingMode ? 'Click on Map to Drop Pin' : '+ Add New Finding'}
            </button>
            <button 
              onClick={clearInspection}
              className="px-5 py-3 flex items-center gap-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-base font-medium"
            >
              <Trash2 size={20} />
              Clear Session
            </button>
            <button 
              onClick={() => exportToExcel(findings, projectTitle)}
              disabled={findings.length === 0}
              className={`px-4 py-2 flex items-center gap-2 rounded-lg text-sm font-semibold transition-all shadow-md
                ${findings.length === 0 
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
                  : 'bg-green-600 hover:bg-green-500 text-white shadow-green-500/20'}`}
            >
              <FileSpreadsheet size={18} />
              Export Excel
            </button>
            <button 
              onClick={() => setShowSignatureModal(true)}
              disabled={isGenerating || findings.length === 0}
              className={`px-6 py-3 flex items-center gap-2 rounded-lg text-base font-semibold transition-all shadow-md
                ${isGenerating || findings.length === 0 
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
                  : 'bg-brand-crimson hover:bg-red-500 text-white shadow-red-500/20'}`}
            >
              {isGenerating ? (
                <span className="animate-pulse">Generating...</span>
              ) : (
                <>
                  <FileText size={20} />
                  Generate PDF Report
                </>
              )}
            </button>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden relative">
        {!planImage ? (
          <PlanUploader setMapMode={() => { /* no-op */ }} />
        ) : (
          <>
            <div className="flex-1 relative">
              <MapViewer 
                planImage={planImage}
                findings={findings}
                onMapClick={() => {}}
                onFindingClick={(id) => setActiveFindingId(id)}
              />
            </div>
            <FindingSidebar />
            
            <PdfTemplates findings={findings} planImage={planImage} imageDimensions={imageDimensions} />
          </>
        )}
      </main>

      {/* Signature Modal */}
      {showSignatureModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-dark-panel border border-dark-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-dark-border bg-[#15181e]">
              <h3 className="text-lg font-bold text-white">Inspector Signature</h3>
              <button onClick={() => setShowSignatureModal(false)} className="text-slate-400 hover:text-white p-1 rounded-md transition-colors hover:bg-slate-700">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 bg-white">
              <SignatureCanvas
                ref={sigPadRef}
                canvasProps={{
                  className: 'w-full h-48 border-2 border-dashed border-gray-300 rounded-lg',
                  style: { backgroundColor: 'white' }
                }}
              />
            </div>
            {/* Cert # and Date inputs */}
            <div className="px-4 pb-4 bg-[#15181e] grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Inspection Date</label>
                <input
                  type="text"
                  value={inspectionDate}
                  onChange={(e) => setInspectionDate(e.target.value)}
                  className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-1.5 text-sm text-white focus:border-brand-amber focus:outline-none"
                  placeholder="MM/DD/YYYY"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">CWI Cert #</label>
                <input
                  type="text"
                  value={certNumber}
                  onChange={(e) => setCertNumber(e.target.value)}
                  className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-1.5 text-sm text-white focus:border-brand-amber focus:outline-none"
                  placeholder="e.g. 9999999"
                />
              </div>
            </div>
            <div className="p-4 border-t border-dark-border bg-[#15181e] flex justify-end gap-3">
              <button 
                onClick={() => sigPadRef.current?.clear()} 
                className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
              >
                Clear
              </button>
              <button 
                onClick={handleGeneratePdf}
                className="px-6 py-2 bg-brand-crimson hover:bg-red-500 text-white font-bold rounded-lg transition-colors shadow-md"
              >
                Confirm & Generate PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function App() {
  return (
    <InspectionProvider>
      <Dashboard />
    </InspectionProvider>
  );
}

export default App;
