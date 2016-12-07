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


class PythonMadeGreatAgain {

  overwriteDefault() {
    const custom = this.serverless.service.custom;
    if (!_.has(custom, 'greatAgain')) {
      //throw new this.serverless.classes.Error(
      return BbPromise.reject(new IgnorableError(
        'Want to be great again you got to set up custom.greatAgain.'));
    }
    const greatAgain = custom.greatAgain;
    if (_.has(greatAgain, 'wrapName') && greatAgain.wrapName) {
      this.wrapName = greatAgain.wrapName;
    }
    this.log('wrapName: ' + this.wrapName);
    if (_.has(greatAgain, 'libSubDir') && greatAgain.libSubDir) {
      this.libSubDir = greatAgain.libSubDir;
    }
    this.log('libSubDir: ' + this.libSubDir);
    if (_.has(greatAgain, 'cleanup')) {
      this.cleanup = greatAgain.cleanup;
    }
    this.log('cleanup: ' + this.cleanup);
    return BbPromise.resolve();
  };

  selectOne() {
    const greatAgain = this.serverless.service.custom.greatAgain;
    const target = this.options.function;
    const targetObj = this.options.functionObj;
    const targetKey = this.wrapName + ':' + target;
    const wrapper = this.wrapName + '.handler';

    if (_.has(greatAgain, targetKey) &&
      _.endsWith(targetObj.handler, wrapper)) {
      return BbPromise.resolve({
        'name': target,
        'function': targetObj,
        'realHandler': greatAgain[targetKey]
      })
    }
    return BbPromise.reject(new IgnorableError(
      'Want to be great again you got to set up custom.greatAgain.'));
  }

  selectAll() {
    const functions = this.serverless.service.functions;
    const greatAgain = this.serverless.service.custom.greatAgain;
    const prefix = this.wrapName + ':';
    const prefixLen = (this.wrapName + ':').length;
    const wrapper = this.wrapName + '.handler';
    // validation
    const targetKeys = _.keys(greatAgain).filter((targetKey) => {
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
        'realHandler': greatAgain[targetKey]
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
    const wrapper = this.wrapName + '.handler';
    const wrapperPy = this.wrapName + '.py';
    const wrapperDir = target.function.handler.substring(0,
      target.function.handler.length - wrapper.length);
    const packagePath = Path.join(wrapperDir, this.libSubDir);
    const requirements = Path.join(wrapperDir, 'requirements.txt');

    return this.wrap(wrapperDir, wrapperPy, packagePath, target.realHandler)
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

  wrap(dir, filename, packagePath, realHandler) {
    const content = `
# vim:fileencoding=utf-8
# ${filename}
# This file is generated on the fly by serverless-python-made-great-again plugin.
import sys
sys.path.insert(0, '${packagePath}')
import ${realHandler} as real_handler

def handler(event, context):
  return real_handler(event, context)
 
`;
    return Fse.outputFileAsync(Path.join(dir, filename), content);
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
    this.log('cleaning...')
    const wrapper = this.wrapName + '.handler';
    const wrapperPy = this.wrapName + '.py';
    const wrapperDir = target.function.handler.substring(0,
      target.function.handler.length - wrapper.length);
    const packagePath = Path.join(wrapperDir, this.libSubDir);
    return BbPromise.settle([this.remove(wrapperPy), this.remove(packagePath)])
  };


  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.log = (msg) => { serverless.cli.log('[GreatAgain] ' + msg); };
    // overwritten by custom.greatAgain.wrapName
    this.wrapName = 'wrap';
    // overwritten by custom.greatAgain.libSubDir
    this.libSubDir = 'lib';
    // overwritten by custom.greatAgain.cleanup
    this.cleanup = true;
    this.hooks = {
      'before:deploy:createDeploymentArtifacts': () => BbPromise.bind(this)
        .then(this.overwriteDefault)
        .then(this.selectAll)
        .map(this.work),

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
        .then(this.work),

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

module.exports = PythonMadeGreatAgain;
