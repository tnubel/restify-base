/*jshint node:true, indent:2, globalstrict: true, asi: true, laxcomma: true, laxbreak: true */
/*global module:true, require:true, console:true, process:true */

'use strict';

var path = require('path')
  , cluster = require('cluster')
  , fs = require('fs')

// configuration loader
// https://github.com/rjyo/yaml-config-node
var config = require('yaml-config')

// logger
// https://github.com/trentm/node-bunyan
var bunyan = require('bunyan')

// rest api
// http://mcavage.github.com/node-restify/
var restify = require('restify')

var settings = config.readConfig(path.join(__dirname, 'config.yaml'))


var LOG_DIR = path.join(__dirname, 'logs')
  , PID_DIR = path.join(__dirname, 'pids')

var numCPUs = require('os').cpus().length
var appName = require(path.join(__dirname, 'package')).name
var version = require('./package').version

// if process.env.NODE_ENV has not been set, default to development
var NODE_ENV = process.env.NODE_ENV || 'development'

var logger


/*
 * configure and start logging
 */
var startLogging = function () {
  // Create log directory if it doesnt exist
  if (! fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR)
  }

  // Log to console and log file
  var loglevel = 'debug'
  var log = bunyan.createLogger({
    name: appName
  , streams: [
      {
        stream: process.stdout
      , level: 'warn'
      }
    , {
        path: path.join(LOG_DIR, appName + '-log.json')
      , level: loglevel
      }
    ]
  , serializers: bunyan.stdSerializers
  })
  log.info('Starting ' + appName + ', version ' + version)
  log.debug('Logging setup completed.')
  return log
}


/*
    create a pid file for each process in PID_DIR
    @param {Number} pid The process id
    @param {String} type The type of the process - master or worker
*/
var writePid = function (pid, type) {
  var pidFile = PID_DIR + '/' + type + '-' + pid + '.pid'
  fs.writeFile(pidFile, pid, function (err) {
    if (err) {
      logger.warn('Unable to create pid file ' + pidFile)
    }
  })
}


/*
   Set up web server
   @param {Object} opts The configuration options for the application
   @param {Object} logger The logging instance
   @return the created server
*/
var createServer = function (port, logger) {

  var server = restify.createServer({
    log: logger
  , name: appName
  })

  server.use(restify.acceptParser(server.acceptable))
  server.use(restify.queryParser())

  server.on('NotFound', function (req, res) {
    res.send(404, req.url + ' was not found');
  })
  
  server.on('after', restify.auditLogger({ log: logger }))
  
  // routes
  
  // sample route
  // USAGE EXAMPLE: /test
  server.get('/test', function (req, res, next) {
    res.send('test')        
    next()
  })


  
  // start listening
  server.listen(port, function () {
    logger.info('%s listening at %s', server.name, server.url)
  })
  
  return server
}
  
  
// set up logging
logger = startLogging()


// Create pid directory if it doesnt exist
if (! fs.existsSync(PID_DIR)) {
  fs.mkdirSync(PID_DIR)
}
// TODO - remove old pids


/*
   Set up cluster and start servers
*/

if (cluster.isMaster) {
  
  writePid(process.pid, 'master')
  logger.info('Starting master, pid ' + process.pid + ', spawning ' + numCPUs + ' workers')

  // fork workers
  for (var i = 0; i < numCPUs; i++) {
    cluster.fork()
  }

  // if a worker dies, respawn
  cluster.on('death', function (worker) {
    logger.warn('Worker ' + worker.pid + ' died, restarting...')
    // remove pid file
    var pidFile = PID_DIR + '/master-' + worker.pid + '.pid'
    fs.unlink(pidFile, function (err) {
      if (err) {
        logger.warn('Unable to remove pid file ' + pidFile)
      }
    })
    cluster.fork()
  })

} 
else {
  
  // Worker processes
  writePid(process.pid, 'worker')
  logger.info('Worker ' + process.env.NODE_WORKER_ID + ' starting, pid ' + process.pid)
  
  // start servers
  console.log('starting worker on port ' + settings.apiserver.port)
  var server = createServer(settings.apiserver.port, logger)

}
