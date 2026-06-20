const router = require('express').Router();
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const ctrl = require('../controllers/upload.controller');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

router.post('/', authenticateToken, upload.single('image'), ctrl.uploadSingle);
router.delete('/', authenticateToken, ctrl.deleteOne);

module.exports = router;
