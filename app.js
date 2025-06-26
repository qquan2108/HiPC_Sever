var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan'); 
var hbs     = require('hbs');

var adminRouter = require('./routes/admin');
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
var imagesRouter = require('./routes/image');
var productreviewsRouter = require('./routes/productreviews');
var tsktproductsRouter = require('./routes/tsktproducts'); // Thêm dòng này
var brandsRouter = require('./routes/brands');
var vouchersRouter = require('./routes/vouchers');
var searchRouter = require('./routes/search');
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
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Đăng ký helper so sánh
hbs.registerHelper('ifEquals', function(a, b, options) {
  // nếu a hoặc b chưa có, sẽ cho vào nhánh else (nghĩa không match)
  if (a == null || b == null) {
    return options.inverse(this);
  }
  return a.toString() === b.toString()
    ? options.fn(this)
    : options.inverse(this);
});

// Đăng ký helper JSON stringify
hbs.registerHelper('json', function(context) {
  return JSON.stringify(context);
});

app.use('/admin', adminRouter);
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
app.use('/images', imagesRouter);
app.use('/productreviews', productreviewsRouter);
app.use('/tsktproducts', tsktproductsRouter); // Thêm dòng này
app.use('/brands', brandsRouter);
app.use('/search', searchRouter);
app.use('/vouchers', vouchersRouter);


app.use('/admin/static', express.static(path.join(__dirname, 'public/admin/static')));

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


