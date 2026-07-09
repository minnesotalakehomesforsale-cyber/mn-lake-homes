const express = require('express');
const router = express.Router();
const taskController = require('../controllers/task.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

// Every task endpoint is the internal admin task board — admin-only.
// Previously OPEN to the internet; now auth-walled.
const adminOnly = [verifyToken, requireRole(['admin', 'super_admin'])];

router.get('/counts',  ...adminOnly, taskController.getTaskCounts); // before '/:id'
router.get('/',        ...adminOnly, taskController.getTasks);
router.post('/',       ...adminOnly, taskController.createTask);
router.patch('/:id',   ...adminOnly, taskController.updateTask);     // { note?, details?, due_date?, is_completed? }; empty body = toggle
router.delete('/:id',  ...adminOnly, taskController.deleteTask);

module.exports = router;
