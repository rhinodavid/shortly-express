var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');
var morgan = require('morgan');
var session = require('express-session');
var flash = require('connect-flash');
var expressMessages = require('express-messages');

var app = express();

app.use(morgan('dev'));
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));

app.use(flash());
app.use(function (req, res, next) {
  res.locals.messages = require('express-messages')(req, res);
  next();
});

app.use(express.static(__dirname + '/public'));
app.use(session({
  secret: 'anything',
  resave: false,
  saveUninitialized: true // set as default value 'true' for now
}));

var authenticator = function (req, res, next) {
  if (req.session.user) {
    next();
  } else {
    if (req.get('X-Request-With') === 'XMLHttpRequest') {
      // request came from ajax
      res.sendStatus(403);
    } else {
      // request came from browser
      res.redirect('/login');
    }
  }
};

app.get('/', authenticator, 
function(req, res) {
  res.render('index');
});

app.get('/create', authenticator, 
function(req, res) {
  res.render('index');
});

app.get('/links', authenticator,
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.status(200).send(links.models);
  });
});

app.post('/links', authenticator,
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.get('/login', function (req, res) {
  res.render('login');
});

app.post('/login', 
  function (req, res) {
    var username = req.body.username;
    var password = req.body.password;

    User.login(username, password)
      .then(function(user) {
        req.session.user = {id: user.get('id'), username: user.get('username')};
        req.session.save(function(err) {
          if (err) {
            console.log('Session Save Error:', err);
            return res.sendStatus(400);
          } else {
            return res.redirect('/');
          }
        });
      }).catch(function(err) {
        req.flash('error', 'Incorrect username or password.');
        console.log('Login Error:', err);
        res.redirect('/login');
      });
  }
);

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.post('/signup', 
  function (req, res) {
    new User({username: req.body.username, password: req.body.password})
      .save()
      .then(function(user) {
        req.session.user = {id: user.get('id'), username: user.get('username')};
        req.session.save(function(err) {
          if (err) {
            return err;
          } else {
            return res.redirect('/');
          }
        });
      })
      .catch(function(err) {
        if (err.errno === 19) {
          req.flash('error', 'Username is already in use.');
          return res.redirect('/signup');
        }
        return res.sendStatus(400);
      });

  }
);

app.get('/logout', function(req, res) {
  req.session.user = null;
  req.session.save(function(err) {
    if (err) {
      return res.sendStatus(400);
    } else {
      req.flash('info', 'You have been signed out.');
      return res.redirect('/login');
    }
  });
});

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
