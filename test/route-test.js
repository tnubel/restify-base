/*global describe:true, before:true, after: true, it:true */

'use strict';

var util = require('util')
  , path = require('path')
  , fs = require('fs')
  , settings = require('yaml-config').readConfig(path.join(__dirname, '..', 'config.yaml'), 'default')
  , should = require('chai').should()
  , request = require('supertest')
  , url = 'http://localhost:' + settings.server.port;


describe("test routes", function () {

  before(function (done) {
    
    var server = require('../server');

    // make sure the server is started
    setTimeout(function() {
      request(url)
          .get('/')
          .expect(404)
          .end(function (err, res) {
            if (err) {
              if (err.code === 'ECONNREFUSED') return done(new Error('Server is not running.'));
              return done(err);
            }
            return done();
          });
    }, 500);
  });

  it('should return the correct test route (route:  /test)', function (done) {
    request(url)
          .get('/test')
          .set('Accept', 'application/json')
          .expect('Content-Type', 'application/json')
          .expect(200)
          .end(function (err, res) {
            if (err) return done(err);
            var resp = res.body;
            resp.should.be.an('object');
            resp.result.should.equal("test");
            return done();
          });
  });

});