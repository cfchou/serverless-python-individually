/**
 * Created by cfchou on 02/12/2016.
 */
'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const Path = require('path');
const Fse = require('fs-extra');
const ChildProcess = require('child_process');
const process = require('process');

BbPromise.promisifyAll(Fse);
BbPromise.promisifyAll(ChildProcess);


/**
 * IgnorableError, like Error, breaks the promise chain unless we catch it.
 * It's sole purpose is to distinguish with other Errors. So that it can be
 * seletively caught.
 */
function IgnorableError(message) {
  this.message = message;
  this.name = 'IgnorableError';
  Error.captureStackTrace(this, IgnorableError);
}

IgnorableError.prototype = Object.create(Error.prototype);
IgnorableError.prototype.constructor = IgnorableError;


class PythonIndividually {

  isEnabled() {
    if (this.options['pi-disable']) {
      throw new IgnorableError('disabled due to --pi-disable')
    }
  }

  needCleanup() {
    if (!this.cleanup) {
      throw new IgnorableError('Cleanup is disabled');
    }
  }

  overwriteDefault() {
    const pyIndividually = this.serverless.service.custom.pyIndividually;
    if (!pyIndividually) {
      throw new IgnorableError('no custom.pyIndividually found.');
    }

    if (pyIndividually['wrapName']) {
      this.wrapName = pyIndividually['wrapName'];
    }
    this.log('wrapName: ' + this.wrapName);

    if (pyIndividually['libSubDir']) {
      this.libSubDir = pyIndividually['libSubDir'];
    }
    this.log('libSubDir: ' + this.libSubDir);

    const updater = (key, cliOption, yamlOption, origin) => {
      const enable = 'pi-' + key;
      const disable = 'pi-no-' + key;
      if (cliOption[enable] && cliOption[disable]) {
        throw new that.serverless.classes.Error(
          '[pyIndividually] --' + enable + ' --' + disable + ' both presented');
      }
      if (cliOption[enable]) {
        return true;
      } else if (cliOption[disable]) {
        return false;
      } else if (yamlOption[key]) {
        return yamlOption[key];
      }
      return origin;
    }

    this.cleanup = updater('cleanup', this.options, pyIndividually, this.clean)
    this.log('cleanup: ' + this.cleanup);
    this.dockerizedPip = updater('dockerizedPip', this.options, pyIndividually,
      this.dockerizedPip)
    this.log('dockerizedPip: ' + this.dockerizedPip);
  };

  checkDocker() {
    if (this.dockerizedPip) {
      this.log('docker version');
      const ret = ChildProcess.spawnSync('docker', ['version']);
      if (ret.error) {
        throw new this.serverless.classes.Error(
          '[pyIndividually] docker version: ' + ret.error.message);
      }
      if (ret.stderr.length != 0) {
        throw new this.serverless.classes.Error(
          '[pyIndividually] docker version: ' + ret.stderr.toString());
      }
      const out = ret.stdout.toString();
      this.log(out);
      if (!out.startsWith('Client') || out.search('Server') == -1) {
        throw new this.serverless.classes.Error(
          '[pyIndividually] docker version invalid output: ' + out);
      }
    }
  }

  selectOne() {
    const pyIndividually = this.serverless.service.custom.pyIndividually;
    const target = this.options.function;
    const targetObj = this.options.functionObj;
    const targetKey = this.wrapName + ':' + target;
    const wrapper = this.wrapName + '.handler';

    if (_.has(pyIndividually, targetKey) &&
      _.endsWith(targetObj.handler, wrapper)) {
      return {
        'name': target,
        'function': targetObj,
        'realHandler': pyIndividually[targetKey]
      };
    }
    throw new IgnorableError('custom.pyIndividually is not set up properly');
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
      return {
        'name': target,
        'function': functions[target],
        'realHandler': pyIndividually[targetKey]
      };
    });
  }

  /**
   * Create a wrapper. Install packages.
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
    const requirementsPy = Path.join(packagePath, '_requirements.py');

    return this.wrap(wrapperDir, wrapperPy, this.libSubDir, target.realHandler).bind(this)
      .then(_.partial(this.fileAccessable, Path.join(wrapperDir, 'requirements.txt'))).bind(this)
      .then(_.partial(this.hard_remove, [wrapperPy, packagePath])
      .then(() => { return Fse.ensureDirAsync(packagePath); })
      .then(() => {
        return Fse.copyAsync(
          Path.join(__dirname, 'requirements.py'), requirementsPy);
      }).bind(this)
      .then(_.partial(this.install, wrapperDir, this.libSubDir))
      .then(() => { return Fse.removeAsync(requirementsPy); }).bind(this)
      .then(BbPromise.resolve, _.partial(this.catchIgnorableError, undefined));
  };

  /**
   * Replace exceptions from fs.access with IgnorableError
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


  /**
   * soft_remove doesn't break promise chain even seeing failures.
   * @param paths
   * @returns {Promise.<TResult>|*}
   */
  soft_remove(paths) {
    const that = this;
    // unlike all/map, settle waits for everyone despite of rejections/exceptions.
    return BbPromise.settle(_.map(paths, Fse.removeAsync))
      .then((results) => {
        _.forEach(results, (r) => {
          if (process.env.SLS_DEBUG) {
            that.log(r.reason());
          }
        });
        return BbPromise.resolve();
      });
  }

  hard_remove(paths) {
    return BbPromise.all(_.map(paths, Fse.removeAsync));
  }

  /**
   *
   * @param dir
   * @param filename
   * @param libDir
   * @param realHandler
   * @returns {Promise.<undefined>|*}
   */
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

  /**
   *
   * @param dir
   * @param libDir
   * @returns {Promise.<undefined>|*}
   */
  install(dir, libDir) {
    const cmd = ((dockerized) => {
      if (dockerized) {
        return ['docker', 'run', '-v', process.cwd() + ':/var/task',
          'lambci/lambda:build-python2.7', 'python',
          Path.join(dir, libDir, '_requirements.py'),
          Path.join(dir, 'requirements.txt'),
          Path.join(dir, libDir)];
      } else {
        return ['python',
          Path.join(dir, libDir, '_requirements.py'),
          Path.join(dir, 'requirements.txt'),
          Path.join(dir, libDir)];
      }
    })(this.dockerizedPip);

    this.log('Installing packagings: ' + cmd.join(' '));
    const ret = ChildProcess.spawnSync(cmd[0], cmd.slice(1));
    this.log(ret.stderr.toString());
    this.log(ret.stdout.toString());
    if (ret.error || ret.stderr.length != 0) {
      return BbPromise.reject(ret.error)
    }
    return BbPromise.resolve()
  }

  /**
   * Catch IgnorableError. Replace it with a promise resolved with value. So
   * that the promise chain goes on.
   * @param value
   * @param e
   * @returns {Promise.<undefined>|*}
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

  /**
   *
   * @param target
   * @returns {Promise.<undefined>|*}
   */
  clean(target) {
    this.log('Cleaning packages for ' + target.name);
    const wrapper = this.wrapName + '.handler';
    const wrapperPy = this.wrapName + '.py';
    const wrapperDir = target.function.handler.substring(0,
      target.function.handler.length - wrapper.length);
    const packagePath = Path.join(wrapperDir, this.libSubDir);
    const wrapperPath = Path.join(wrapperDir, wrapperPy);
    this.log('Deleting ' + wrapperPath + ', ' + packagePath);
    //return BbPromise.settle([this.remove(wrapperPath),
    //  this.remove(packagePath)])
    return this.soft_remove([wrapperPath, packagePath]);
  };


  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.log = (msg) => { serverless.cli.log('[pyIndividually] ' + msg); };
    // overwritten by overwriteDefault()
    this.wrapName = 'wrap';
    this.libSubDir = 'lib';
    this.cleanup = true;
    this.dockerizedPip = false;
    this.hooks = {
      'before:deploy:createDeploymentArtifacts': () => BbPromise.bind(this)
        .then(this.isEnabled)
        .then(this.overwriteDefault)
        .then(this.selectAll)
        .map(this.work).bind(this)
        .then(BbPromise.resolve, _.partial(this.catchIgnorableError, undefined)),

      'after:deploy:createDeploymentArtifacts': () => BbPromise.bind(this)
        .then(this.isEnabled)
        .then(this.needCleanup)
        .then(this.selectAll)
        .map(this.clean).bind(this)
        .then(BbPromise.resolve, _.partial(this.catchIgnorableError, undefined)),

      'before:deploy:function:packageFunction': () => BbPromise.bind(this)
        .then(this.isEnabled)
        .then(this.overwriteDefault)
        .then(this.selectOne)
        .then(this.work).bind(this)
        .then(BbPromise.resolve, _.partial(this.catchIgnorableError, undefined)),

      'after:deploy:function:packageFunction': () => BbPromise.bind(this)
        .then(this.isEnabled)
        .then(this.needCleanup)
        .then(this.selectOne)
        .then(this.clean, _.partial(this.catchIgnorableError, undefined)),
    };
  };
}

module.exports = PythonIndividually;
