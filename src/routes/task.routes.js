const express = require('express');
const router = express.Router();
const taskController = require('../controllers/task.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

const guard = [verifyToken, requireRole(['admin', 'super_admin'])];

router.get('/',        guard, taskController.getTasks);
router.post('/',       guard, taskController.createTask);
router.patch('/:id',   guard, taskController.toggleTask);
router.delete('/:id',  guard, taskController.deleteTask);

module.exports = router;
