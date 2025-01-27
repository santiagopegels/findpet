const cron = require('node-cron');
const Search = require('../models/search');
const { deleteFile } = require('../services/uploader/upload');
const { removeFeatures } = require('../services/predicter/removeFeatures');


module.exports = removeSearchesCron = () => {
  //At 00:00 on day-of-month 1 and on Saturday.
  cron.schedule('0 0 1 * 6', async () => {
    console.log('Running cron job to remove searches older than one month');
    try {      
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const searches = await Search.find({ createdAt: { $lt: oneMonthAgo } });
      
      const searchIds = searches.map(search => search._id);
      
      await Search.deleteMany({ _id: { $in: searchIds } });
      console.log('Ids deleted', searchIds);
      
      removeFeatures(searchIds);

      searches.forEach((search) => {
        deleteFile(search._id);
      });

    } catch (err) {
      console.error('Error removing searches:', err);
    }
  });
};
