const express = require('express');
const router = express.Router();
const { activity } = require('../database');

// returns the most recent activity log entries — hard capped at 500
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 500);
  res.json(activity.recent(limit));
});

module.exports = router;
