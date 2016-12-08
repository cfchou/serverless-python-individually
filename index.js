/**
 * Created by cfchou on 02/12/2016.
 */
'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const Path = require('path');
const Fse = require('fs-extra');
const ChildProcess = require('child_process');

BbPromise.promisifyAll(Fse);
BbPromise.promisifyAll(ChildProcess);


function IgnorableError(message) {
  this.message = message;
  this.name = 'IgnorableError';
  Error.captureStackTrace(this, IgnorableError);
}

IgnorableError.prototype = Object.create(Error.prototype);
IgnorableError.prototype.constructor = IgnorableError;


class PythonIndividually {

  overwriteDefault() {
    const custom = this.serverless.service.custom;
    if (!_.has(custom, 'pyIndividually')) {
      //throw new this.serverless.classes.Error(
      return BbPromise.reject(new IgnorableError(
        'no custom.pyIndividually found.'));
    }
    const pyIndividually = custom.pyIndividually;
    if (_.has(pyIndividually, 'wrapName') && pyIndividually.wrapName) {
      this.wrapName = pyIndividually.wrapName;
    }
    this.log('wrapName: ' + this.wrapName);
    if (_.has(pyIndividually, 'libSubDir') && pyIndividually.libSubDir) {
      this.libSubDir = pyIndividually.libSubDir;
    }
    this.log('libSubDir: ' + this.libSubDir);
    if (_.has(pyIndividually, 'cleanup')) {
      this.cleanup = pyIndividually.cleanup;
    }
    this.log('cleanup: ' + this.cleanup);
    return BbPromise.resolve();
  };

  selectOne() {
    const pyIndividually = this.serverless.service.custom.pyIndividually;
    const target = this.options.function;
    const targetObj = this.options.functionObj;
    const targetKey = this.wrapName + ':' + target;
    const wrapper = this.wrapName + '.handler';

    if (_.has(pyIndividually, targetKey) &&
      _.endsWith(targetObj.handler, wrapper)) {
      return BbPromise.resolve({
        'name': target,
        'function': targetObj,
        'realHandler': pyIndividually[targetKey]
      })
    }
    return BbPromise.reject(new IgnorableError(
      'custom.pyIndividually is not set up properly'));
  }

  selectAll() {
    const functions = this.serverless.service.functions;
    const pyIndividually = this.serverless.service.custom.pyIndividually;
    const prefix = this.wrapName + ':';
    const prefixLen = (this.wrapName + ':').length;
    const wrapper = this.wrapName + '.handler';
    // validation
    const targetKeys = _.keys(pyIndividually).filter((targetKey) => {
      if (!_.startsWith(targetKey, prefix) || targetKey.length <= prefixLen) {
        return false;
      }
      const target = targetKey.substring(prefixLen);
      return _.has(functions, target) &&
        _.endsWith(functions[target].handler, wrapper);
    });

    // selection
    return _.map(targetKeys, (targetKey) => {
      const target = targetKey.substring(prefixLen);
      return BbPromise.resolve({
        'name': target,
        'function': functions[target],
        'realHandler': pyIndividually[targetKey]
      })
    });
  }

  /**
   * Create a wrapper. Install packages.
   * IgnorableError are ignored and replaced with BbPromise.resolve().
   * @param target
   * @returns {Promise.<undefined>}
   */
  work(target) {
    this.log('Installing packages for ' + target.name);
    const wrapper = this.wrapName + '.handler';
    const wrapperPy = this.wrapName + '.py';
    const wrapperDir = target.function.handler.substring(0,
      target.function.handler.length - wrapper.length);
    const packagePath = Path.join(wrapperDir, this.libSubDir);
    const requirements = Path.join(wrapperDir, 'requirements.txt');

    return this.wrap(wrapperDir, wrapperPy, this.libSubDir, target.realHandler)
      .then(_.partial(_.bind(this.fileAccessable, this), requirements))
      //.then(_.partial(Fse.ensureDirAsync, packagePath))
      .then(() => { return Fse.ensureDirAsync(packagePath)})
      .then(_.partial(_.bind(this.install, this), packagePath, requirements))
      .then(BbPromise.resolve,
        _.partial(_.bind(this.catchIgnorableError, this), undefined));
  };

  /**
   * Replace exceptions from fs.access with IgnorableError for not interrupting
   * the promise chain.
   * @param filename
   * @returns {Promise.<undefined>|*}
   */
  fileAccessable(filename) {
    return Fse.accessAsync(filename, Fse.constants.R_OK)
      .then(BbPromise.resolve,
        (err) => {
          if (process.env.SLS_DEBUG) {
            this.log(err.stack);
          }
          return BbPromise.reject(new IgnorableError(
            'Can\'t access ' + filename));
      });
  }

  remove(dir) {
    return Fse.removeAsync(dir)
      .then(BbPromise.resolve,
        (err) => {
          if (process.env.SLS_DEBUG) {
            this.log(err.stack);
          }
          return BbPromise.reject(new IgnorableError(
            'Can\'t remove ' + dir));
        });
  }

  wrap(dir, filename, libDir, realHandler) {
    // realHandler: hello/hello.handler
    // handler: hello.handler
    // identifiers: ['hello', 'handler']
    const handler = realHandler.substring(realHandler.lastIndexOf(Path.sep) + 1);
    const identifiers = handler.split('.');
    const content = `
# vim:fileencoding=utf-8
# ${filename}
# This file is generated on the fly by serverless-python-individually plugin.
import os
import sys

root = os.path.abspath(os.path.join(os.path.dirname(__file__)))
sys.path[0:0] = [root, os.path.join(root, \"${libDir}\")]

from ${identifiers[0]} import ${identifiers[1]} as real_handler

def handler(event, context):
  return real_handler(event, context)
 
`;
    const wrapperPath = Path.join(dir, filename);
    this.log('Creating ' + wrapperPath);
    return Fse.outputFileAsync(wrapperPath, content);
  };

  install(packagePath, requirements) {
    const ret = ChildProcess.spawnSync('python', [
      Path.resolve(__dirname, 'requirements.py'),
      requirements, packagePath]);
    this.log(ret.stderr.toString());
    this.log(ret.stdout.toString());
    if (ret.error) {
      return BbPromise.reject(res.error)
    }
    return BbPromise.resolve()
  }

  /**
   * Catch IgnorableError. Replace it with a promise resolved with value. So
   * that the promise chain goes on.
   * @param value
   * @param e
   * @returns {*}
   */
  catchIgnorableError(value, e) {
    if (e instanceof IgnorableError) {
      // log, then swallow
      if (process.env.SLS_DEBUG) {
        this.log(e.stack);
      } else {
        this.log('IgnorableError: ' + e.message)
      }
      // NOTE: following functions in the promise chain will be executed.
      return BbPromise.resolve(value);
    } else {
      //throw new this.serverless.classes.Error(e.message);
      throw e;
    }
  };

  clean(target) {
    this.log('Cleaning packages for ' + target.name);
    const wrapper = this.wrapName + '.handler';
    const wrapperPy = this.wrapName + '.py';
    const wrapperDir = target.function.handler.substring(0,
      target.function.handler.length - wrapper.length);
    const packagePath = Path.join(wrapperDir, this.libSubDir);
    const wrapperPath = Path.join(wrapperDir, wrapperPy);
    this.log('Deleting ' + wrapperPath + ', ' + packagePath);
    return BbPromise.settle([this.remove(wrapperPath), this.remove(packagePath)])
  };


  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.log = (msg) => { serverless.cli.log('[pyIndividually] ' + msg); };
    // overwritten by custom.pyIndividually.wrapName
    this.wrapName = 'wrap';
    // overwritten by custom.pyIndividually.libSubDir
    this.libSubDir = 'lib';
    // overwritten by custom.pyIndividually.cleanup
    this.cleanup = true;
    this.hooks = {
      'before:deploy:createDeploymentArtifacts': () => BbPromise.bind(this)
        .then(this.overwriteDefault)
        .then(this.selectAll)
        .map(this.work)
        .then(BbPromise.resolve, _.partial(this.catchIgnorableError, undefined)),

      'after:deploy:createDeploymentArtifacts': () => BbPromise.bind(this)
        .then(_.bind(() => {
          if (!this.cleanup) {
            // fall through until catch
            return BbPromise.reject(new IgnorableError('Cleanup is disabled'))
          }
          return BbPromise.resolve();
        }, this))
        .then(this.selectAll)
        .map(this.clean)
        .then(BbPromise.resolve, _.partial(this.catchIgnorableError, undefined)),

      'before:deploy:function:packageFunction': () => BbPromise.bind(this)
        .then(this.overwriteDefault)
        .then(this.selectOne)
        .then(this.work)
        .then(BbPromise.resolve, _.partial(this.catchIgnorableError, undefined)),

      'after:deploy:function:packageFunction': () => BbPromise.bind(this)
        .then(_.bind(() => {
          if (!this.cleanup) {
            // fall through until catch
            return BbPromise.reject(new IgnorableError('Cleanup is disabled'))
          }
          return BbPromise.resolve();
        }, this))
        .then(this.selectOne)
        .then(this.clean, _.partial(this.catchIgnorableError, undefined)),
    };
  };
}

module.exports = PythonIndividually;
