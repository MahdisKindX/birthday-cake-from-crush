// src/components/ReflectionOverlay.tsx
import { useMemo, useState } from "react";
import { generateReflectionPdf } from "../utils/generateReflectionPdf";

type ReflectionOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function ReflectionOverlay({ isOpen, onClose }: ReflectionOverlayProps) {
  const [step, setStep] = useState<0 | 1>(0);
  const [moments22, setMoments22] = useState("");
  const [goals23, setGoals23] = useState("");

  const canNext = useMemo(() => moments22.trim().length > 0, [moments22]);
  const canDownload = useMemo(
    () => moments22.trim().length > 0 && goals23.trim().length > 0,
    [moments22, goals23]
  );

  if (!isOpen) return null;

  const downloadPdf = () => {
    const doc = generateReflectionPdf({
      title: "Masgu's Birthday Reflection",
      moments22,
      goals23,
    });
    doc.save("birthday-reflection.pdf");
  };

  return (
    <div className="reflection-overlay" role="dialog" aria-modal="true">
      <div className="reflection-card">
        <div className="reflection-top">
          <div className="reflection-title">little reflection</div>
          <button className="reflection-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="reflection-stepper">
          <div className={`step-dot ${step === 0 ? "active" : ""}`}>1</div>
          <div className="step-line" />
          <div className={`step-dot ${step === 1 ? "active" : ""}`}>2</div>
        </div>

        {step === 0 ? (
          <div className="reflection-content">
            <div className="reflection-heading">Favorite moments of being 22</div>
            <div className="reflection-sub">
              Little memories, big moments, anything you want to remember.
            </div>
            <textarea
              className="reflection-textarea"
              value={moments22}
              onChange={(e) => setMoments22(e.target.value)}
              placeholder="Write them here…"
              rows={8}
            />
          </div>
        ) : (
          <div className="reflection-content">
            <div className="reflection-heading">Goals + accomplishments for 23</div>
            <div className="reflection-sub">
              What do you want to achieve? What are you proud of already?
            </div>
            <textarea
              className="reflection-textarea"
              value={goals23}
              onChange={(e) => setGoals23(e.target.value)}
              placeholder="Write them here…"
              rows={8}
            />
          </div>
        )}

        <div className="reflection-actions">
          <button
            className="reflection-btn ghost"
            onClick={() => (step === 0 ? onClose() : setStep(0))}
          >
            {step === 0 ? "Not now" : "Back"}
          </button>

          {step === 0 ? (
            <button
              className="reflection-btn"
              disabled={!canNext}
              onClick={() => setStep(1)}
            >
              Next
            </button>
          ) : (
            <button
              className="reflection-btn"
              disabled={!canDownload}
              onClick={downloadPdf}
            >
              Download PDF
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
