var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan'); 

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var productsRouter = require('./routes/products');
var categorysRouter = require('./routes/categorys');
var ordersRouter = require('./routes/orders');
var buildproductsRouter = require('./routes/buildproducts');
var chatmessagesRouter = require('./routes/chatmessages');
var chatsessionsRouter = require('./routes/chatsessions');
var comparisonproductsRouter = require('./routes/comparisonproducts');
var comparisonsRouter = require('./routes/comparisons');
var imagesearchsRouter = require('./routes/imagesearchs');
var productreviewsRouter = require('./routes/productreviews');
const { default: mongoose } = require('mongoose');
var cors = require('cors');

var app = express();
app.use(cors());


// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

mongoose.connect(process.env.MONGO_URI)
.then(() => {
  console.log('MongoDB connected');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/category', categorysRouter);
app.use('/product', productsRouter);
app.use('/orders', ordersRouter);
app.use('/buildproducts', buildproductsRouter);
app.use('/chatmessages', chatmessagesRouter);
app.use('/chatsessions', chatsessionsRouter);
app.use('/comparisonproducts', comparisonproductsRouter);
app.use('/comparisons', comparisonsRouter);
app.use('/imagesearchs', imagesearchsRouter);
app.use('/productreviews', productreviewsRouter);



// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
