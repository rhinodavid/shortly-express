var db = require('../config');
var bcrypt = require('bcrypt-nodejs');
var Promise = require('bluebird');

bcrypt.compareAsync = Promise.promisify(bcrypt.compare);

var User = db.Model.extend({
  tableName: 'users',
  hasTimestamps: true,

  hashPassword: function(model, attrs, options) {
    return new Promise( function (resolve, reject) {
      bcrypt.hash(model.attributes.password, null, null, function (err, hash) {
        if (err) { 
          reject(err); 
        } else {
          model.set('password', hash);
          resolve(hash);
        }
      });
    });
  },

  initialize: function() {
    this.on('creating', this.hashPassword, this);
  }
},
  {
    login: Promise.method( function(username, password) {
      if (!username || !password) {
        throw new Error('Username and password are both required');
      }
      return new this({username: username}).fetch({require: true})
      .catch(function(err) {
        throw new Error('User not found');
      })
      .tap( function (user) {
        return bcrypt.compareAsync(password, user.get('password'))
          .then(function(result) {
            if (!result) {
              throw new Error('Invalid Password');
            }
          });
      });
    })
  }
);

module.exports = User;