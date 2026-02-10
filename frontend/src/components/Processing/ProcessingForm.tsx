import { useState } from 'react';
import { useCreateJob } from '../../hooks/useApi';
import { Crop, Palette, Clock, Film, Rocket, ChevronRight, ChevronLeft } from 'lucide-react';

interface Props {
  selectedImages: string[];
  onJobCreated?: () => void;
}

export default function ProcessingForm({ selectedImages, onJobCreated }: Props) {
  const [step, setStep] = useState(0);
  const createJob = useCreateJob();

  // Processing params
  const [crop, setCrop] = useState({ enabled: false, x: 0, y: 0, w: 1920, h: 1080 });
  const [falseColor, setFalseColor] = useState({ enabled: false, method: 'vegetation' });
  const [timestamp, setTimestamp] = useState({ enabled: true, position: 'bottom-left' });
  const [scale, setScale] = useState({ enabled: false, factor: 1.0 });

  // Video params
  const [video, setVideo] = useState({
    fps: 24,
    codec: 'h264',
    quality: 23,
    interpolation: 'none',
  });

  const steps = [
    { icon: Crop, label: 'Image Processing' },
    { icon: Film, label: 'Video Settings' },
    { icon: Rocket, label: 'Review & Launch' },
  ];

  const handleLaunch = () => {
    createJob.mutate(
      {
        job_type: 'image_process',
        input_path: '',
        params: {
          image_ids: selectedImages,
          crop: crop.enabled ? crop : null,
          false_color: falseColor.enabled ? falseColor : null,
          timestamp: timestamp.enabled ? timestamp : null,
          scale: scale.enabled ? scale : null,
          video,
        },
      },
      { onSuccess: () => onJobCreated?.() }
    );
  };

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              i === step ? 'bg-primary/10 text-primary' : 'text-slate-400 hover:text-white'
            }`}
          >
            <s.icon className="w-4 h-4" />
            {s.label}
          </button>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-slate-800 rounded-xl p-6 space-y-6">
        {step === 0 && (
          <>
            {/* Crop */}
            <Section
              icon={<Crop className="w-4 h-4" />}
              label="Crop Region"
              enabled={crop.enabled}
              onToggle={() => setCrop({ ...crop, enabled: !crop.enabled })}
            >
              <div className="grid grid-cols-4 gap-3">
                {(['x', 'y', 'w', 'h'] as const).map((key) => (
                  <div key={key}>
                    <label className="text-xs text-slate-400 uppercase">{key}</label>
                    <input
                      type="number"
                      value={crop[key]}
                      onChange={(e) => setCrop({ ...crop, [key]: Number(e.target.value) })}
                      className="mt-1 w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                ))}
              </div>
            </Section>

            {/* False Color */}
            <Section
              icon={<Palette className="w-4 h-4" />}
              label="False Color"
              enabled={falseColor.enabled}
              onToggle={() => setFalseColor({ ...falseColor, enabled: !falseColor.enabled })}
            >
              <select
                value={falseColor.method}
                onChange={(e) => setFalseColor({ ...falseColor, method: e.target.value })}
                className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm w-full"
              >
                <option value="vegetation">Vegetation (NDVI)</option>
                <option value="fire">Fire Detection</option>
                <option value="water_vapor">Water Vapor</option>
                <option value="dust">Dust RGB</option>
                <option value="airmass">Air Mass</option>
              </select>
            </Section>

            {/* Timestamp */}
            <Section
              icon={<Clock className="w-4 h-4" />}
              label="Timestamp Overlay"
              enabled={timestamp.enabled}
              onToggle={() => setTimestamp({ ...timestamp, enabled: !timestamp.enabled })}
            >
              <select
                value={timestamp.position}
                onChange={(e) => setTimestamp({ ...timestamp, position: e.target.value })}
                className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm w-full"
              >
                <option value="top-left">Top Left</option>
                <option value="top-right">Top Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="bottom-right">Bottom Right</option>
              </select>
            </Section>

            {/* Scale */}
            <Section
              icon={<Crop className="w-4 h-4" />}
              label="Scale"
              enabled={scale.enabled}
              onToggle={() => setScale({ ...scale, enabled: !scale.enabled })}
            >
              <input
                type="range"
                min={0.25}
                max={4}
                step={0.25}
                value={scale.factor}
                onChange={(e) => setScale({ ...scale, factor: Number(e.target.value) })}
                className="w-full accent-primary"
              />
              <span className="text-sm text-slate-300">{scale.factor}x</span>
            </Section>
          </>
        )}

        {step === 1 && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 uppercase">FPS</label>
                <input
                  type="range"
                  min={1}
                  max={60}
                  value={video.fps}
                  onChange={(e) => setVideo({ ...video, fps: Number(e.target.value) })}
                  className="w-full accent-primary mt-2"
                />
                <span className="text-sm text-slate-300">{video.fps} fps</span>
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase">Quality (CRF)</label>
                <input
                  type="range"
                  min={0}
                  max={51}
                  value={video.quality}
                  onChange={(e) => setVideo({ ...video, quality: Number(e.target.value) })}
                  className="w-full accent-primary mt-2"
                />
                <span className="text-sm text-slate-300">{video.quality}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 uppercase">Codec</label>
                <select
                  value={video.codec}
                  onChange={(e) => setVideo({ ...video, codec: e.target.value })}
                  className="mt-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm w-full"
                >
                  <option value="h264">H.264</option>
                  <option value="hevc">HEVC (H.265)</option>
                  <option value="av1">AV1</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase">Interpolation</label>
                <select
                  value={video.interpolation}
                  onChange={(e) => setVideo({ ...video, interpolation: e.target.value })}
                  className="mt-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm w-full"
                >
                  <option value="none">None</option>
                  <option value="blend">Frame Blending</option>
                  <option value="mci">Motion Compensated</option>
                </select>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Review</h3>
            <div className="bg-slate-700/50 rounded-lg p-4 space-y-2 text-sm">
              <p>
                <span className="text-slate-400">Images:</span> {selectedImages.length} selected
              </p>
              {crop.enabled && (
                <p>
                  <span className="text-slate-400">Crop:</span> {crop.x},{crop.y} {crop.w}×{crop.h}
                </p>
              )}
              {falseColor.enabled && (
                <p>
                  <span className="text-slate-400">False Color:</span> {falseColor.method}
                </p>
              )}
              <p>
                <span className="text-slate-400">Timestamp:</span>{' '}
                {timestamp.enabled ? timestamp.position : 'Off'}
              </p>
              <p>
                <span className="text-slate-400">Video:</span> {video.fps}fps, {video.codec},{' '}
                CRF {video.quality}
              </p>
            </div>
            <button
              onClick={handleLaunch}
              disabled={createJob.isPending || selectedImages.length === 0}
              className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-dark text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              <Rocket className="w-5 h-5" />
              {createJob.isPending ? 'Launching...' : 'Launch Job'}
            </button>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="flex items-center gap-1 text-sm text-slate-400 hover:text-white disabled:opacity-30"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={() => setStep(Math.min(2, step + 1))}
          disabled={step === 2}
          className="flex items-center gap-1 text-sm text-slate-400 hover:text-white disabled:opacity-30"
        >
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Section({
  icon,
  label,
  enabled,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {label}
        </div>
        <button
          onClick={onToggle}
          className={`w-10 h-5 rounded-full transition-colors relative ${
            enabled ? 'bg-primary' : 'bg-slate-600'
          }`}
        >
          <div
            className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
      {enabled && <div className="pl-6">{children}</div>}
    </div>
  );
}
