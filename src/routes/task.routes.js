const express = require('express');
const router = express.Router();
const taskController = require('../controllers/task.controller');

// No auth walls per project convention
router.get('/',       taskController.getTasks);
router.post('/',      taskController.createTask);
router.patch('/:id',  taskController.toggleTask);
router.delete('/:id', taskController.deleteTask);

module.exports = router;
