class AnimalDetector {
    static model = null;
    static isReady = false;
    static isLoading = false;

    // Etiquetas de COCO-SSD que consideramos "animales" o "mascotas"
    static validClasses = [
        'cat', 'dog', 'bird', 'horse'
    ];

    static async init() {
        if (this.isReady) return true;
        if (this.isLoading) return false;

        this.isLoading = true;
        try {
            console.log('Cargando modelo de detección animal...');
            // Load the Coco SSD model.
            this.model = await cocoSsd.load();
            this.isReady = true;
            console.log('Modelo cargado exitosamente.');
            return true;
        } catch (error) {
            console.error('Error al cargar el modelo de detección:', error);
            return false;
        } finally {
            this.isLoading = false;
        }
    }

    static async containsAnimal(imageElement) {
        if (!this.isReady) {
            const loaded = await this.init();
            if (!loaded) {
                console.warn('El modelo no está disponible, omitiendo validación.');
                return true; // Fallback: si falla de cargar, permitimos
            }
        }

        try {
            const predictions = await this.model.detect(imageElement);
            console.log('Predicciones:', predictions);

            // Verificar si hay alguna clase válida con una probabilidad decente
            const hasAnimal = predictions.some(p => {
                return p.score > 0.4 && this.validClasses.includes(p.class);
            });

            return hasAnimal;
        } catch (error) {
            console.error('Error durante la detección:', error);
            return true; // Fallback
        }
    }
}
