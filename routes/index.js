var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

// Trang đăng nhập Admin
router.get('/login', function (req, res) {
  res.render('login', { title: 'Login' });
});

router.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { title: 'Forgot Password' });
});

router.get('/reset-password/:token', (req, res) => {
  res.render('reset-password', { token: req.params.token, title: 'Reset Password' });
});

module.exports = router;
