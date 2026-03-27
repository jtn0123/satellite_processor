import { CheckCircle } from 'lucide-react';
import type { GoesFrame } from '../types';
import AddToCollectionModal from '../AddToCollectionModal';
import TagModal from '../TagModal';
import FramePreviewModal from '../FramePreviewModal';
import ComparisonModal from '../ComparisonModal';

interface BrowseModalsProps {
  showAddToCollection: boolean;
  collectionFrameIds: string[];
  onCloseCollection: () => void;
  showTagModal: boolean;
  tagFrameIds: string[];
  onCloseTag: () => void;
  previewFrame: GoesFrame | null;
  onClosePreview: () => void;
  allFrames: GoesFrame[];
  onNavigatePreview: (f: GoesFrame) => void;
  compareFrames: [GoesFrame, GoesFrame] | null;
  onCloseCompare: () => void;
  processingJobId: string | null;
}

export default function BrowseModals({
  showAddToCollection,
  collectionFrameIds,
  onCloseCollection,
  showTagModal,
  tagFrameIds,
  onCloseTag,
  previewFrame,
  onClosePreview,
  allFrames,
  onNavigatePreview,
  compareFrames,
  onCloseCompare,
  processingJobId,
}: Readonly<BrowseModalsProps>) {
  return (
    <>
      {showAddToCollection && (
        <AddToCollectionModal frameIds={collectionFrameIds} onClose={onCloseCollection} />
      )}
      {showTagModal && <TagModal frameIds={tagFrameIds} onClose={onCloseTag} />}
      {previewFrame && (
        <FramePreviewModal
          frame={previewFrame}
          onClose={onClosePreview}
          allFrames={allFrames}
          onNavigate={onNavigatePreview}
        />
      )}
      {compareFrames && (
        <ComparisonModal
          frameA={compareFrames[0]}
          frameB={compareFrames[1]}
          onClose={onCloseCompare}
        />
      )}
      {processingJobId && (
        <div className="text-sm text-emerald-400 flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          Processing job created: {processingJobId}
        </div>
      )}
    </>
  );
}
