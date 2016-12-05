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


  beforePackaging() {
    let that = this;
    this.cli.log('beforePackaging...');
    let promises = _.mapValues(this.serverless.service.functions, function (value, key) {
      //return BbPromise.bind(that).then(_.partial(that.log, value, key));
      return that.dummy(value, key);
    });
    return BbPromise.props(promises).then(function () {
      let vs = _.values(promises);
      for (let v of vs) {
        that.cli.log('promise done...' + v.value().toString());
      }
      that.cli.log('done...');
    });
  };

  dummy(value, key) {
      this.cli.log('...' + key + ':' + value.toString());
      return BbPromise.resolve(key);
  };

  overwriteDefault() {
    const custom = this.serverless.service.custom;
    if (!_.has(custom, 'greatAgain')) {
      //throw new this.serverless.classes.Error(
      throw new IgnorableError(
        'Want to be great again you got to do something. Please set up custom.greatAgain.');
    }
    const greatAgain = custom.greatAgain;
    if (_.has(greatAgain, 'wrapName') && greatAgain.wrapName) {
      this.wrapName = greatAgain.wrapName;
    }
    this.cli.log('wrapName: ' + this.wrapName);
    if (_.has(greatAgain, 'libSubDir') && greatAgain.libSubDir) {
      this.libSubDir = greatAgain.libSubDir;
    }
    this.cli.log('libSubDir: ' + this.libSubDir);
    if (_.has(greatAgain, 'cleanup')) {
      this.cleanup = greatAgain.cleanup;
    }
    this.cli.log('cleanup: ' + this.cleanup);
  };

  selectOne() {
    const functions = this.serverless.service.functions;
    const greatAgain = this.serverless.service.custom.greatAgain;
    const target = this.options.function;
    const targetObj = this.options.functionObj;
    const targetKey = this.wrapName + ':' + target;
    const wrapper = this.wrapName + '.handler';

    if (_.has(greatAgain, targetKey) &&
      _.endsWith(targetObj.handler, wrapper)) {
      return {
        'name': target,
        'function': targetObj,
        'realHandler': greatAgain[targetKey]
      }
    }
    throw new IgnorableError(
      'Want to be great again you got to do something. Please set up custom.greatAgain.');
  }

  selectAll() {
    const functions = this.serverless.service.functions;
    const greatAgain = this.serverless.service.custom.greatAgain;
    const prefix = this.wrapName + ':';
    const prefixLen = (this.wrapName + ':').length;
    const wrapper = this.wrapName + '.handler';
    // validation
    //const targetKeys = _.keys(greatAgain).filter(_.bind(this.validateWrap, this));
    const targetKeys = _.keys(greatAgain).filter(function (targetKey) {
      if (!_.startsWith(targetKey, prefix) || targetKey.length <= prefixLen) {
        return false;
      }
      const target = targetKey.substring(prefixLen);
      return _.has(functions, target) &&
        _.endsWith(functions[target].handler, wrapper);
    });

    // selection
    return _.map(targetKeys, function (targetKey) {
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
      target.function.handler.length - wrapper.length)
    const packagePath = Path.join(handlerDir, this.libSubDir);
    const requirements = Path.join(handlerDir, 'requirements.txt');
    let promise = this.wrap(handlerDir, this.wrapName + '.py', packagePath,
      target.realHandler);
    promise.then(_.partial(_.bind(this.install, this), packagePath, requirements));
    return promise;
  }

  install(packagePath, requirements) {
    const that = this;
    return Fse.ensureDirAsync(packagePath)
      .then(Fse.existsAsync(requirements))
      .then(function (exists) {
        that.cli.log(requirements + ' exists? ' + exists)
      });
    //ChildProcess.spawnSync('python')
  }

  notWork(e) {
    if (e instanceof IgnorableError) {
      // log then swallow
      this.cli.log('Error in serverless-python-made-great-again: ' + e.stack)
      return BbPromise.resolve();
    } else {
      //throw new this.serverless.classes.Error(e.message);
      throw e;
    }
  }
  beforePackagingOne() {
    this.serverless.cli.log('beforePackagingOne...');
  };

  afterPackaging() {
    this.serverless.cli.log('afterPackaging...');
  };

  afterPackagingOne() {
    this.serverless.cli.log('afterPackagingOne...');
  };

  wrap(dir, filename, packagePath, realHandler) {
    const content = `
# vim:fileencoding=utf-8
# ${filename}
# This file is generated on the fly by serverless-python-made-great-again plugin.
import sys
sys.path.append('${packagePath}')
import ${realHandler} as real_handler

def handler(event, context):
  return real_handler(event, context)
 
`
    return Fse.outputFileAsync(Path.join(dir, filename), content);
  }


  cleanupArtifact() {
    if (this.serverless.config.servicePath) {
      const serverlessTmpDirPath = Path.join(this.serverless.config.servicePath, '.serverless_bk');


      if (this.serverless.utils.dirExistsSync(serverlessTmpDirPath)) {
        Fse.removeSync(serverlessTmpDirPath);
      }
    }
  };

  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.cli = serverless.cli
    this.hooks = {
      'before:deploy:createDeploymentArtifacts': () => BbPromise.bind(this)
        .then(this.overwriteDefault)
        .then(this.selectAll)
        .map(this.work)
        .then(BbPromise.resolve, this.notWork),


      'after:deploy:createDeploymentArtifacts': () => BbPromise.bind(this)
        .then(this.afterPackaging),

      'before:deploy:function:packageFunction': () => BbPromise.bind(this)
        .then(this.overwriteDefault)
        .then(this.selectOne)
        .then(this.work, this.notWork),

      'after:deploy:function:packageFunction': () => BbPromise.bind(this)
        .then(this.afterPackagingOne),
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
