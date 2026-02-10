interface Props {
  src: string;
}

export default function VideoPlayer({ src }: Props) {
  return (
    <div className="bg-slate-800 rounded-xl overflow-hidden">
      <video
        src={src}
        controls
        className="w-full"
        style={{ maxHeight: '70vh' }}
      >
        Your browser does not support video playback.
      </video>
    </div>
  );
}
