const express = require('express');
const router = express.Router();
const Blocklist = require('../models/Blocklist');
const requireAuth = require('../middleware/requireAuth');

router.get('/', requireAuth, async (req, res) => {
  try {
    const list = await Blocklist.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, blocklist: list.map(item => ({ ...item.toObject(), source: require('../utils/recipientBatch').blockSource(item) })) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch blocklist.' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { value, type, reason } = req.body;
    if (typeof value !== 'string' || !['email', 'domain'].includes(type)) return res.status(400).json({ error: 'Value and type are required' });
    
    let cleanValue = value.trim().toLowerCase();
    if (type === 'domain') {
      cleanValue = cleanValue.replace(/^@/, ''); // remove leading @ if user typed it
    }

    // Check if already exists
    const existing = await Blocklist.findOne({ userId: req.user.id, value: cleanValue, type });
    if (existing) {
      return res.status(400).json({ error: 'This value is already in your blocklist.' });
    }

    const newItem = new Blocklist({
      userId: req.user.id,
      value: cleanValue,
      type,
      source: 'manual',
      reason: typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 500) : 'Manual block'
    });

    await newItem.save();
    res.json({ success: true, item: newItem });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add to blocklist.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await Blocklist.findOneAndDelete({ _id: id, userId: req.user.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete blocklist item.' });
  }
});

module.exports = router;
