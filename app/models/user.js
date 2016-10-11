var db = require('../config');
var bcrypt = require('bcrypt-nodejs');
var Promise = require('bluebird');



var User = db.Model.extend({
  tableName: 'users',
  hasTimestamps: true,
  verifyPassword: function(attemptedPassword) {
    return new Promise ( function (resolve, reject) {
      bcrypt.compare(this.get('password'), attemptedPassword, function(err, result) {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  },

  hashPassword: function(model, attrs, options) {
    return new Promise( function (resolve, reject) {
      bcrypt.hash(model.attributes.password, null, console.log.bind(this), function (err, hash) {
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
});

module.exports = User;