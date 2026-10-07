import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MobileNet } from '@tensorflow-models/mobilenet';
import CanvasIcon, { CanvasBrand } from './CanvasIcons';
import '../App.css';
import './ImageClassifier.css';

type Prediction = { className: string; probability: number };
const MAX_FILE_BYTES = 10 * 1024 * 1024;
let modelPromise: Promise<MobileNet> | undefined;
function loadModel() {
  if (!modelPromise) modelPromise = Promise.all([import('@tensorflow-models/mobilenet'), import('@tensorflow/tfjs-core'),
    import('@tensorflow/tfjs-backend-webgl'), import('@tensorflow/tfjs-backend-cpu')])
    .then(async ([mobilenet, tf]) => {
      if (!await tf.setBackend('webgl')) await tf.setBackend('cpu');
      await tf.ready();
      return mobilenet.load({ version: 2, alpha: 1 });
    })
    .catch(error => { modelPromise = undefined; throw error; });
  return modelPromise;
}

export default function ImageClassifier() {
  const imageRef = useRef<HTMLImageElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const currentUrl = useRef('');
  const activeRequest = useRef(0);
  const [imageUrl, setImageUrl] = useState('');
  const [filename, setFilename] = useState('');
  const [imageReady, setImageReady] = useState(false);
  const [results, setResults] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const previous = document.title;
    document.title = 'Image classifier · Canvas Together';
    return () => { document.title = previous; activeRequest.current += 1; URL.revokeObjectURL(currentUrl.current); };
  }, []);

  const selectImage = (file?: File) => {
    if (!file || loading) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('Choose a JPG, PNG, WebP, or GIF image.'); return;
    }
    if (file.size > MAX_FILE_BYTES) { setError('This image is too large. Choose a file smaller than 10 MB.'); return; }
    activeRequest.current += 1;
    URL.revokeObjectURL(currentUrl.current);
    currentUrl.current = URL.createObjectURL(file);
    setImageReady(false);
    setResults([]);
    setFilename(file.name);
    setImageUrl(currentUrl.current);
  };
  const classify = async () => {
    const image = imageRef.current;
    if (!image || !imageReady || loading) return;
    const requestId = ++activeRequest.current;
    setLoading(true); setError(''); setResults([]);
    try {
      const model = await loadModel();
      const predictions = await model.classify(image, 3);
      if (requestId === activeRequest.current) setResults(predictions);
    } catch {
      if (requestId === activeRequest.current) setError('The model could not load or analyze this image. Check your internet connection and try again.');
    } finally { if (requestId === activeRequest.current) setLoading(false); }
  };

  return <div className="classifier-page">
    <nav className="landing-nav" aria-label="Main navigation"><Link className="brand-link" to="/"><CanvasBrand /></Link>
      <Link className="button button-secondary" to="/"><CanvasIcon name="home" width="17" height="17" /> Back to your spaces</Link></nav>
    <main className="classifier-main">
      <span className="eyebrow">A LITTLE EXPERIMENT IN CURIOSITY</span>
      <h1>What’s in the picture<span className="heading-dot">?</span></h1>
      <p className="classifier-intro">Explore image recognition with MobileNet. The analysis happens right in your browser; your picture stays on your device.</p>
      <div className="classifier-grid">
        <section className="classifier-card" aria-labelledby="upload-title"><h2 id="upload-title">Bring a picture</h2>
          <div className={`image-dropzone${imageUrl ? ' has-image' : ''}`} onDragOver={event => event.preventDefault()}
            onDrop={event => { event.preventDefault(); selectImage(event.dataTransfer.files[0]); }}>
            {imageUrl ? <img ref={imageRef} src={imageUrl} alt="Selected image preview" onLoad={() => {
              if ((imageRef.current?.naturalWidth || 0) * (imageRef.current?.naturalHeight || 0) > 40_000_000) {
                setError('This image has too many pixels. Choose an image under 40 megapixels.'); setImageReady(false);
              } else setImageReady(true);
            }} onError={() => { setImageReady(false); setError('This file could not be opened as an image. Please choose another.'); }} /> :
              <div><span className="upload-icon"><CanvasIcon name="image" width="36" height="36" /></span><h3>A new perspective starts here.</h3><p>Drop an image, or choose one below.</p></div>}
          </div>
          <p className="image-filename">{filename || 'JPG, PNG, WebP, or GIF · Up to 10 MB'}</p>
          <input ref={uploadRef} className="sr-only" id="classifier-upload" type="file" aria-label="Upload an image"
            accept="image/jpeg,image/png,image/webp,image/gif" disabled={loading} onChange={event => {
              selectImage(event.target.files?.[0]); event.target.value = '';
            }} />
          <div className="classifier-actions"><button className="button button-secondary" disabled={loading} onClick={() => uploadRef.current?.click()}>
            <CanvasIcon name="image" width="17" height="17" />{imageUrl ? 'Choose another image' : 'Choose an image'}</button>
            <button className="button button-primary" disabled={loading || !imageReady} onClick={() => void classify()}>
              <CanvasIcon name="sparkle" width="17" height="17" />{loading ? 'Analyzing…' : 'Classify image'}</button></div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
        <section className="classifier-card prediction-card" aria-labelledby="results-title"><div className="panel-heading"><h2 id="results-title">A machine’s best guess</h2><span className="guest-badge">MobileNet V2</span></div>
          {loading ? <div className="prediction-placeholder" role="status"><span className="classifier-spinner" /><h3>A little thinking time.</h3><p>The first analysis downloads the model. After that, it’s ready for your next picture.</p></div> :
            results.length ? <ol className="predictions" aria-label="Classification results">{results.map((result, index) => <li key={result.className}>
              <div><span className="prediction-rank">0{index + 1}</span><strong>{result.className}</strong><span>{(result.probability * 100).toFixed(1)}%</span></div>
              <div className="prediction-track"><span style={{ width: `${result.probability * 100}%` }} /></div></li>)}</ol> :
              <div className="prediction-placeholder"><CanvasIcon name="sparkle" width="42" height="42" /><h3>Let curiosity lead.</h3><p>Choose a picture and hit “Classify image” to see the model’s top three predictions.</p></div>}
          <p className="classifier-note">Trained on ImageNet’s 1,000 categories, this model recognizes everyday objects. Predictions are estimates, and abstract sketches may not match a known category.</p>
        </section>
      </div>
      <Link to="/" className="classifier-back"><CanvasIcon name="arrow" width="17" height="17" /> Take your ideas back to the canvas</Link>
    </main>
  </div>;
}
