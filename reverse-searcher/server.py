import numpy as np
from PIL import Image
from feature_extractor import FeatureExtractor
from datetime import datetime
from flask import Flask, request, jsonify
from functools import wraps
from pathlib import Path
import base64
from io import BytesIO
from dotenv import load_dotenv
import os

load_dotenv()
app = Flask(__name__)
fe = FeatureExtractor()

def require_api_key(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        api_key = request.headers.get('API_KEY')
        if api_key and api_key == os.getenv('API_KEY'):
            return f(*args, **kwargs)
        else:
            return jsonify(status=403, message="Forbidden: Invalid API_KEY"), 403
    return decorated_function

@app.route('/save-feature', methods=['POST'])
@require_api_key
def save():
    filename = request.get_json().get('filename')

    feature = fe.extract(img=Image.open('./images/' + filename + '.png'))
    feature_path = Path('./feature') / (filename + ".npy")
    np.save(feature_path, feature)
    return jsonify(status=200, message="success", data=filename)

@app.route('/reverse-search', methods=['POST'])
@require_api_key
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