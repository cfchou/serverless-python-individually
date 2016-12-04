/**
 * Created by cfchou on 02/12/2016.
 */
'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const path = require('path');
const fse = require('fs-extra');
const child_process = require('child_process');

BbPromise.promisifyAll(fse);

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
      return BbPromise.resolve(key)
  };

  beforePackagingOne() {
    this.serverless.cli.log('beforePackagingOne...');
    if (this.serverless.service.custom &&
      this.serverless.service.custom.greatAgain) {
      if (this.serverless.service.custom.greatAgain.cleanup) {
        this.cleanup = this.serverless.service.custom.greatAgain.cleanup
      }
      if (this.serverless.service.custom.greatAgain.libSubDir) {
        // TODO: throw if excluded
        this.libSubDir = this.serverless.service.custom.greatAgain.libSubDir
      }
    }
    this.serverless.cli.log('cleanup:');
  };

  afterPackaging() {
    this.serverless.cli.log('afterPackaging...');
  };

  afterPackagingOne() {
    this.serverless.cli.log('afterPackagingOne...');
  };

  wrapping(wrapName, package_path, handler) {
    const content = `
# vim:fileencoding=utf-8
# ${wrapName}.py
# This file is generated on the fly by serverless-python-made-great-again plugin.
import sys
sys.path.append('${package_path}')
import ${handler} as real_handler

def handler(event, context):
  return real_handler(event, context)
 
`

  }


  cleanup() {
    if (this.serverless.config.servicePath) {
      const serverlessTmpDirPath = path.join(this.serverless.config.servicePath, '.serverless_bk');


      if (this.serverless.utils.dirExistsSync(serverlessTmpDirPath)) {
        fse.removeSync(serverlessTmpDirPath);
      }
    }
  };

  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.cli = serverless.cli
    this.hooks = {
      'before:deploy:createDeploymentArtifacts': () => BbPromise.bind(this)
        .then(this.beforePackaging),

      'after:deploy:createDeploymentArtifacts': () => BbPromise.bind(this)
        .then(this.afterPackaging),

      'before:deploy:function:packageFunction': () => BbPromise.bind(this)
        .then(this.beforePackagingOne),

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
