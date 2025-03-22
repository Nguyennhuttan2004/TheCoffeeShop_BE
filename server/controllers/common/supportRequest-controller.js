const SupportRequest = require('../../models/SupportRequest.js');

exports.createSupportRequest = async (req, res) => {
  try {
    const supportRequest = new SupportRequest(req.body);
    await supportRequest.save();
    res.status(201).send({ message: 'Support request saved successfully' });
  } catch (error) {
    res.status(400).send({ error: 'Failed to save support request' });
  }
};
exports.getSupportRequests = async (req, res) => {
  try {
    const supportRequests = await SupportRequest.find();
    res.status(200).send(supportRequests);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch support requests' });
  }
};

exports.deleteSupportRequest = async (req, res) => {
  try {
    const { id } = req.params;
    await SupportRequest.findByIdAndDelete(id);
    res.status(200).send({ message: 'Support request deleted successfully' });
  } catch (error) {
    res.status(400).send({ error: 'Failed to delete support request' });
  }
};