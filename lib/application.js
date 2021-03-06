
/**
 * Module dependencies.
 */

var debug = require('debug')('koa:application');
var Emitter = require('events').EventEmitter;
var compose = require('koa-compose');
var Context = require('./context');
var Stream = require('stream');
var http = require('http');
var co = require('co');

/**
 * Application prototype.
 */

var app = Application.prototype;

/**
 * Expose `Application`.
 */

exports = module.exports = Application;

/**
 * Initialize a new `Application`.
 *
 * @api public
 */

function Application() {
  if (!(this instanceof Application)) return new Application;
  this.env = process.env.NODE_ENV || 'development';
  this.on('error', this.onerror);
  this.outputErrors = 'test' != this.env;
  this.subdomainOffset = 2;
  this.poweredBy = true;
  this.jsonSpaces = 2;
  this.middleware = [];
}

/**
 * Inherit from `Emitter.prototype`.
 */

Application.prototype.__proto__ = Emitter.prototype;

/**
 * Shorthand for:
 *
 *    http.createServer(app.callback()).listen(...)
 *
 * @param {Mixed} ...
 * @return {Server}
 * @api public
 */

app.listen = function(){
  var server = http.createServer(this.callback());
  return server.listen.apply(server, arguments);
};

/**
 * Use the given middleware `fn`.
 *
 * @param {Function} fn
 * @return {Application} self
 * @api public
 */

app.use = function(fn){
  debug('use %s', fn.name || '-');
  this.middleware.push(fn);
  return this;
};

/**
 * Return a request handler callback
 * for node's native http server.
 *
 * @return {Function}
 * @api public
 */

app.callback = function(){
  var mw = [respond].concat(this.middleware);
  var gen = compose(mw);
  var self = this;

  return function(req, res, next){
    var ctx = new Context(self, req, res);

    co.call(ctx, gen)(next || ctx.onerror);
  }
};

/**
 * Default error handler.
 *
 * @param {Error} err
 * @api private
 */

app.onerror = function(err){
  if (!this.outputErrors) return;
  if (404 == err.status) return;
  console.error(err.stack);
};

/**
 * Response middleware.
 */

function *respond(next){
  this.status = 200;
  if (this.app.poweredBy) this.set('X-Powered-By', 'koa');

  yield next;

  var res = this.res;
  var body = this.body;
  var head = 'HEAD' == this.method;
  var noContent = 204 == this.status || 304 == this.status;

  // 404
  if (null == body && 200 == this.status) {
    this.status = 404;
  }

  // ignore body
  if (noContent) return res.end();

  // status body
  if (null == body) {
    this.type = 'text';
    body = http.STATUS_CODES[this.status];
  }

  // Buffer body
  if (Buffer.isBuffer(body)) {
    if (head) return res.end();
    return res.end(body);
  }

  // string body
  if ('string' == typeof body) {
    if (head) return res.end();
    return res.end(body);
  }

  // Stream body
  if (body instanceof Stream) {
    if (!~body.listeners('error').indexOf(this.onerror)) body.on('error', this.onerror);
    if (head) return res.end();
    return body.pipe(res);
  }

  // body: json
  body = JSON.stringify(body, null, this.app.jsonSpaces);
  this.length = Buffer.byteLength(body);
  if (head) return res.end();
  res.end(body);
}
