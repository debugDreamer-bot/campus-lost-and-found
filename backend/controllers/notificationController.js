const Notification = require('../models/Notification');

exports.getMyNotifications = async (req, res) => {
  try {
    const [notifications, unread] = await Promise.all([
      Notification.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(20),
      Notification.countDocuments({ user: req.user.id, read: false })
    ]);
    res.json({ notifications, unread });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user.id, read: false }, { read: true });
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.markRead = async (req, res) => {
  try {
    await Notification.updateOne({ _id: req.params.id, user: req.user.id }, { read: true });
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
