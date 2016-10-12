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
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var GitHubStrategy = require('passport-github2').Strategy;
var tokens = require('./lib/githubTokens');

var app = express();

app.use(morgan('dev'));
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'anything',
  resave: true,
  saveUninitialized: true // set as default value 'true' for now
}));
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
app.use(flash());
app.use(function (req, res, next) {
  res.locals.messages = require('express-messages')(req, res);
  next();
});
app.use(passport.initialize());
app.use(passport.session());


// PASSPORT CONFIGURATION

passport.use(new LocalStrategy(
  function(username, password, done) {
    User.login(username, password)
      .then(function(user) {
        return done(null, user);
      })
      .catch(function(err) {
        if (err.message === 'Invalid Password' || err.message === 'User not found') {
          return done(null, false, { message: 'Incorrect username or password.' });
        } else {
          return done(err);
        }
      });
  }
));

passport.use(new GitHubStrategy({
  clientID: tokens.GITHUB_CLIENT_ID,
  clientSecret: tokens.GITHUB_CLIENT_SECRET,
  callbackURL: 'http://127.0.0.1:4568/auth/github/callback'
},
function(accessToken, refreshToken, profile, done) {
  console.log(profile);
  new User({githubId: profile.id}).findOrCreate()
    .then(function(user) {
      return done(null, user);
    })
    .catch(function(err) {
      if (err.message === 'Invalid Password' || err.message === 'User not found') {
        return done(null, false, { message: 'Incorrect username or password.' });
      } else {
        return done(err);
      }
    });
}));


passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  new User({id: id})
  .fetch()
  .then(function(user) {
    done(null, user);
  })
  .catch(function(err) {
    done(err, null);
  });
});

var isAuthenticated = function (req, res, next) {
  if (req.isAuthenticated()) {
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

app.get('/', isAuthenticated, 
function(req, res) {
  res.render('index');
});

app.get('/create', isAuthenticated, 
function(req, res) {
  res.render('index');
});

app.get('/links', isAuthenticated,
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.status(200).send(links.models);
  });
});

app.post('/links', isAuthenticated,
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

app.get('/auth/github', 
  passport.authenticate('github', { scope: [ 'user:email' ] })
);

app.get('/auth/github/callback', 
  passport.authenticate('github', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/');
  });

app.get('/login', function (req, res) {
  res.render('login');
});

app.post('/login', passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login',
  failureFlash: true  
}));

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.post('/signup', 
  function (req, res) {
    new User({username: req.body.username, password: req.body.password})
      .save()
      .then(function(user) {
        req.login(user, function(err) {
          if (err) {
            return res.sendStatus(400);
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
  req.logout();
  req.flash('info', 'You have been signed out.');
  res.redirect('/login');
});

// app.get('/logout', function(req, res) {
//   req.session.user = null;
//   req.session.save(function(err) {
//     if (err) {
//       return res.sendStatus(400);
//     } else {
//       req.flash('info', 'You have been signed out.');
//       return res.redirect('/login');
//     }
//   });
// });

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
