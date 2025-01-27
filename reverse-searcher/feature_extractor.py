from tensorflow.keras.preprocessing import image
from tensorflow.keras.applications.vgg16 import VGG16, preprocess_input
from tensorflow.keras.models import Model, load_model
import numpy as np

class FeatureExtractor:
    def __init__(self):
        #base_model = VGG16(weights="imagenet")
        #self.model = Model(inputs=base_model.input, outputs=base_model.get_layer("fc2").output)

        self.model = load_model('vgg16_imagenet.h5')
    def extract(self, img):
        img = img.resize((224,224)).convert("RGB")
        imgModel = image.img_to_array(img)
        imgModel = np.expand_dims(imgModel, axis=0)
        imgModel = preprocess_input(imgModel)
        feature = self.model.predict(imgModel)[0]
        return feature / np.linalg.norm(feature)