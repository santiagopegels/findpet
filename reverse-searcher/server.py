import numpy as np
from PIL import Image
from feature_extractor import FeatureExtractor
from datetime import datetime
from flask import Flask, request, render_template, jsonify
from pathlib import Path

app = Flask(__name__)

# Read image features
fe = FeatureExtractor()
features = []
img_paths = []
for feature_path in Path("./feature").glob("*.npy"):
    features.append(np.load(feature_path))
    img_paths.append(Path("./static/dogs") / (feature_path.stem + ".jpg"))
features = np.array(features)

@app.route('/save-feature', methods=['POST'])
def save():
    filename = request.get_json().get('filename')

    feature = fe.extract(img=Image.open('./uploads/' + filename + '.png'))
    feature_path = Path('./feature') / (filename + ".npy")
    np.save(feature_path, feature)
    return jsonify(status=200, message="success", id=filename)

@app.route('/reverse-search', methods=['GET'])
def reverse_search():
    # file = request.files['query_img']
    # img = Image.open(file.stream)  # PIL image

    features = []
    img_paths = []
    for feature_path in Path("./feature").glob("*.npy"):
        print(feature_path)
        features.append(np.load(feature_path))
    features = np.array(features)
    print(features)
    query = fe.extract(img)
    dists = np.linalg.norm(features-query, axis=1)  # L2 distances to features
    ids = np.argsort(dists)[:15]  # Top 15 results

    return jsonify(status=200, message="success", ids=ids)

if __name__=="__main__":
    app.run("0.0.0.0")