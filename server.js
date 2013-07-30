/*global module:true, require:true, console:true, process:true */

'use strict';

var path = require('path')
  , cluster = require('cluster')
  , fs = require('fs')
  , config = require('yaml-config')
  , bunyan = require('bunyan')
  , restify = require('restify')
  , settings = config.readConfig(path.join(__dirname, 'config.yaml'))
  , numCpus = require('os').cpus().length
  , pkg = require(path.join(__dirname, 'package'))
  , appName = pkg.name
  , appVersion = pkg.version
  , logDir = settings.logs.dir || path.join(__dirname, 'logs')
  , logFile = path.join(logDir, appName + '-log.json')
  , logErrorFile = path.join(logDir, appName + '-errors.json')
  , logLevel = settings.logs.level || 'debug'
  , port = settings.server.port || 8000
  , logger;

// if process.env.NODE_ENV has not been set, default to development
var NODE_ENV = process.env.NODE_ENV || 'development';


/*
 * configure and start logging
 */
function startLogging () {
  // Create log directory if it doesnt exist
  if (! fs.existsSync(logDir)) fs.mkdirSync(logDir);

  // Log to console and log file
  var log = bunyan.createLogger({
    name: appName
  , streams: [ 
      {
        stream: process.stdout
      , level: 'warn'
      }
    , { 
        path: logFile
      , level: logLevel
      , type: 'rotating-file'
      , period: '1d'
      }
    , { 
        path: logErrorFile
      , level: 'error'
      }
    ]
  , serializers: bunyan.stdSerializers
  });

  log.info('Starting ' + appName + ', version ' + appVersion);
  log.info('Environment set to ' + NODE_ENV);
  log.debug('Logging setup completed.');
  
  return log;
}


/*
 * Set up server
 * @param {Object} opts The configuration options for the application
 * @param {Object} logger The logging instance
 * @return the created server
 */
function createServer (port, logger) {

  var server = restify.createServer({
    log: logger
  , name: appName
  });

  server.use(restify.acceptParser(server.acceptable));
  server.use(restify.queryParser());

  server.on('NotFound', function (req, res, next) {
    logger.debug('404', 'Request for ' + req.url + ' not found. No route.');
    res.send(404, req.url + ' was not found');
  });
  
  server.on('after', restify.auditLogger({ log: logger }));
  
  // DEFINE ROUTES
  
  // sample route
  // USAGE EXAMPLE: /test
  server.get('/test', function (req, res, next) {
    res.send({'result': 'test'});      
    return next();
  });


  
  // start listening
  server.listen(port, function () {
    logger.info('%s listening at %s', server.name, server.url);
  });
  
  return server;
}
  
  

// set up logging
logger = startLogging();

// Set up cluster and start servers
if (cluster.isMaster) {
  
  logger.info('Starting master, pid ' + process.pid + ', spawning ' + numCpus + ' workers');

  // fork workers
  for (var i = 0; i < numCpus; i++) {
    cluster.fork();
  }

  // if a worker dies, respawn
  cluster.on('death', function (worker) {
    logger.warn('Worker ' + worker.pid + ' died, restarting...');
    cluster.fork();
  });

} 
else {
  
  // Worker processes
  logger.info('Worker ' + process.env.NODE_WORKER_ID + ' starting, pid ' + process.pid);
  
  // start servers
  console.log('starting worker on port ' + port);
  var server = createServer(port, logger);

}
