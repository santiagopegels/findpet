const cron = require('node-cron');
const Search = require('../models/search');
const { deleteFile } = require('../services/uploader/upload');
const { removeFeatures } = require('../services/predicter/removeFeatures');


module.exports = removeSearchesCron = () => {
  // At 02:00 every day - run daily cleanup
  // Format: minute hour day month weekday
  cron.schedule('0 2 * * *', async () => {
    console.log('Running cron job to remove searches older than 30 days');
    try {      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const searches = await Search.find({ createdAt: { $lt: thirtyDaysAgo } });
      
      if (searches.length === 0) {
        return;
      }

      const searchIds = searches.map(search => search._id.toString());
      
      // Eliminar características en el sistema predictivo
      await removeFeatures(searchIds);

      // Eliminar imágenes
      await Promise.all(searches.map(search => deleteFile(search._id.toString())));

      // Eliminar registros en mongodb
      await Search.deleteMany({ _id: { $in: searchIds } });
      console.log('Ids deleted', searchIds);

    } catch (err) {
      console.error('Error removing searches:', err);
    }
  });
};
