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
      throw new IgnorableError(
        'Want to be great again you got to set up custom.greatAgain.');
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
  };

  selectOne() {
    const functions = this.serverless.service.functions;
    const greatAgain = this.serverless.service.custom.greatAgain;
    const target = this.options.function;
    const targetObj = this.options.functionObj;
    const targetKey = this.wrapName + ':' + target;
    const wrapper = this.wrapName + '.handler';
    this.xxx = true;

    if (_.has(greatAgain, targetKey) &&
      _.endsWith(targetObj.handler, wrapper)) {
      return {
        'name': target,
        'function': targetObj,
        'realHandler': greatAgain[targetKey]
      }
    }
    throw new IgnorableError(
      'Want to be great again you got to set up custom.greatAgain.');
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
      return {
        'name': target,
        'function': functions[target],
        'realHandler': greatAgain[targetKey]
      }
    });
  }

  work(target) {
    const wrapper = this.wrapName + '.handler';
    const handlerDir = target.function.handler.substring(0,
      target.function.handler.length - wrapper.length);
    const packagePath = Path.join(handlerDir, this.libSubDir);
    const requirements = Path.join(handlerDir, 'requirements.txt');

    let promise = this.wrap(handlerDir, this.wrapName + '.py', packagePath,
      target.realHandler)
    promise = promise.then(_.partial(_.bind(this.install, this), packagePath,
      requirements));

    this.works.push(promise);
    return promise;
  };

  install(packagePath, requirements) {
    const that = this;
    return Fse.ensureDirAsync(packagePath)
      .then(() => {
          return Fse.accessAsync(requirements, Fse.constants.R_OK);
      })
      .then(() => {
        that.log(requirements + ' exists');
        const ret = ChildProcess.spawnSync('python', [
          Path.resolve(__dirname, 'requirements.py'),
          requirements, packagePath]);
        that.log(ret.stderr.toString());
        that.log(ret.stdout.toString());
        return BbPromise.resolve();
      }, () => {
        return BbPromise.resolve();
      });
  };

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


  ignoreIgnorableError(e) {
    if (e instanceof IgnorableError) {
      // log then swallow
      this.log(e.stack);
      // NOTE: following functions in the promise chain will be executed.
      return BbPromise.resolve();
    } else {
      //throw new this.serverless.classes.Error(e.message);
      throw e;
    }
  };

  clean() {
    this.log('cleaning...')
    BbPromise.resolve(this.works).then(() => {
    })
  };


  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.log = (msg) => { serverless.cli.log('[GreatAgain] ' + msg); };
    // array of promises
    this.works = [];
    this.hooks = {
      'before:deploy:createDeploymentArtifacts': () => BbPromise.bind(this)
        .then(this.overwriteDefault)
        .then(this.selectAll)
        .map(this.work)
        .then(BbPromise.resolve, this.ignoreIgnorableError),


      'after:deploy:createDeploymentArtifacts': () => BbPromise.bind(this)
        .then(this.clean),

      'before:deploy:function:packageFunction': () => BbPromise.bind(this)
        .then(this.overwriteDefault)
        .then(this.selectOne)
        .then(this.work)
        .then(BbPromise.resolve, this.ignoreIgnorableError),

      'after:deploy:function:packageFunction': () => BbPromise.bind(this)
        .then(this.clean),
    };
    // overwritten by custom.greatAgain.wrapName
    this.wrapName = 'wrap';
    // overwritten by custom.greatAgain.libSubDir
    this.libSubDir = 'lib';
    // overwritten by custom.greatAgain.cleanup
    this.cleanup = true;

  };
}

module.exports = PythonMadeGreatAgain;
