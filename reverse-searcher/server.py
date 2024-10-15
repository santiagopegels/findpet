import numpy as np
from PIL import Image
from feature_extractor import FeatureExtractor
from datetime import datetime
from flask import Flask, request, render_template, jsonify
from pathlib import Path
import base64
from io import BytesIO

app = Flask(__name__)
fe = FeatureExtractor()

@app.route('/save-feature', methods=['POST'])
def save():
    filename = request.get_json().get('filename')

    feature = fe.extract(img=Image.open('./images/' + filename + '.png'))
    feature_path = Path('./feature') / (filename + ".npy")
    np.save(feature_path, feature)
    return jsonify(status=200, message="success", data=filename)

@app.route('/reverse-search', methods=['POST'])
def reverse_search():
    image_data = base64.b64decode(request.get_json().get('image'))
    image = Image.open(BytesIO(image_data))
    features_to_search_ids = request.get_json().get('ids')

    features, image_ids = _load_features(features_to_search_ids)

    query = fe.extract(image)
    dists = np.linalg.norm(features-query, axis=1)  # L2 distances to features
    array_keys = np.argsort(dists)[:10]
    search_ids = [image_ids[i] for i in array_keys]

    return jsonify(status=200, message="success", data=search_ids)

def _load_features(features_to_search_ids):
    features = []
    image_ids = []
    for feature_id in features_to_search_ids:
        feature_path = Path("./feature") / (feature_id + ".npy")
        if feature_path.exists():
            features.append(np.load(feature_path))
            image_ids.append(feature_path.stem)
    return np.array(features), image_ids
    
if __name__=="__main__":
    app.run("0.0.0.0")