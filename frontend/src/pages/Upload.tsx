import UploadZone from '../components/Upload/UploadZone';
import ImageGallery from '../components/ImageGallery/ImageGallery';

export default function UploadPage() {
  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Upload Images</h1>
        <p className="text-slate-400 text-sm mt-1">
          Upload satellite images for processing
        </p>
      </div>
      <UploadZone />
      <div>
        <h2 className="text-lg font-semibold mb-4">Image Library</h2>
        <ImageGallery />
      </div>
    </div>
  );
}
