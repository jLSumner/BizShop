const express = require('express');
const router = express.Router();
const { categories, activity } = require('../database');

// list all categories with their active product counts
router.get('/', (req, res) => {
  res.json(categories.all());
});

router.get('/:id', (req, res) => {
  const cat = categories.findById(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  res.json(cat);
});

// create a new category — URL slug gets generated automatically from the name
router.post('/', (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    const cat = categories.create({ name: name.trim(), description });
    activity.log('category', `Category created: "${cat.name}"`);
    res.status(201).json(cat);
  } catch (err) {
    res.status(err.code === 'UNIQUE' ? 409 : 500).json({ error: err.message });
  }
});

// update a category — re-slugs the name as well
router.put('/:id', (req, res) => {
  if (!categories.findById(req.params.id)) return res.status(404).json({ error: 'Category not found' });
  const { name, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    const updated = categories.update(req.params.id, { name: name.trim(), description });
    activity.log('category', `Category updated: "${updated.name}"`);
    res.json(updated);
  } catch (err) {
    res.status(err.code === 'UNIQUE' ? 409 : 500).json({ error: err.message });
  }
});

// delete a category — only allowed if it's empty, no products left behind
router.delete('/:id', (req, res) => {
  if (!categories.findById(req.params.id)) return res.status(404).json({ error: 'Category not found' });
  const count = categories.itemCount(req.params.id);
  if (count > 0) return res.status(409).json({ error: `Cannot delete: ${count} item(s) still in this category` });
  const cat = categories.findById(req.params.id);
  categories.delete(req.params.id);
  activity.log('category', `Category deleted: "${cat.name}"`);
  res.json({ success: true });
});

module.exports = router;
