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

class ServerlessPythonMadeGreatAgain {

  beforePackaging() {
    this.serverless.cli.log('beforePackaging...');

  }

  beforePackagingOne() {
    this.serverless.cli.log('beforePackagingOne...');
  }

  afterPackaging() {
    this.serverless.cli.log('afterPackaging...');
  };

  afterPackagingOne() {
    this.serverless.cli.log('afterPackagingOne...');
    if (this.serverless.service.custom &&
      this.serverless.service.custom.spmga &&
      this.serverless.service.custom.spmga.backup) {
      this.serverless.cli.log('backup...');
      cleanup()
    }
  };

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
    this.backup = undefined
  };
}

module.exports = ServerlessPythonMadeGreatAgain;
