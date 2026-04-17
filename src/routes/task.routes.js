const express = require('express');
const router = express.Router();
const taskController = require('../controllers/task.controller');

// No auth walls per project convention
router.get('/counts',  taskController.getTaskCounts); // must come before '/:id'
router.get('/',        taskController.getTasks);
router.post('/',       taskController.createTask);
router.patch('/:id',   taskController.updateTask);     // accepts { note?, details?, due_date?, is_completed? }; empty body = toggle
router.delete('/:id',  taskController.deleteTask);

module.exports = router;
