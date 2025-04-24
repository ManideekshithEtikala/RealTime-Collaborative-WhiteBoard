import React, { useRef, useState } from 'react';
import * as mobilenet from '@tensorflow-models/mobilenet';
import '@tensorflow/tfjs';

export default function ImageClassifier() {
  const imgRef = useRef<HTMLImageElement>(null);
  const [results, setResults] = useState<{ className: string; probability: number }[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (imgRef.current) imgRef.current.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const classify = async () => {
    if (!imgRef.current) return;
    setIsLoading(true);
    const model = await mobilenet.load();
    const predictions = await model.classify(imgRef.current);
    setResults(predictions);
    setIsLoading(false);
  };

  return (
    <div className="container mt-4">
      <div className="card shadow-sm">
        <div className="card-body">
          <div className="mb-3">
            <input
              type="file"
              accept="image/*"
              className="form-control"
              onChange={handleImageUpload}
            />
          </div>
          <div className="text-center mb-3">
            <img
              ref={imgRef}
              alt="Uploaded Preview"
              crossOrigin="anonymous"
              className="img-fluid rounded shadow-sm"
              style={{ maxWidth: '100%', maxHeight: '300px' }}
            />
          </div>
          <div className="text-center">
            <button
              className="btn btn-success"
              onClick={classify}
              disabled={isLoading}
            >
              {isLoading ? 'Classifying...' : 'Classify Image'}
            </button>
          </div>
          {results.length > 0 && (
            <div className="mt-4">
              <h5 className="text-center">Classification Results</h5>
              <ul className="list-group">
                {results.map((res, idx) => (
                  <li
                    key={idx}
                    className="list-group-item d-flex justify-content-between align-items-center"
                  >
                    <span>{res.className}</span>
                    <span className="badge bg-primary rounded-pill">
                      {(res.probability * 100).toFixed(2)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}