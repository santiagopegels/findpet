const Queue = require('../models/search')

const createSearch = async (req, res) => {
    try {

        queue = new Queue(req.body)
        queue.users.push(req.uid);

        const queueCreated = await queue.save()

        return res.status(201).json({
            status: true,
            queue: queueCreated
        })

    } catch (error) {
        console.log(error)
    }
}