# serverless-python-individually

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)

- [What's it?](#whats-it)
- [What's new?](#whats-new)
- [Why do I need it?](#why-do-i-need-it)
- [How?](#how)
- [How to install platform-dependent packages?](#how-to-install-platform-dependent-packages)
- [Advanced configuration](#advanced-configuration)
- [Demo](#demo)
- [Credit](#credit)
- [Note](#note)


# What's it?
It's a simple plugin for serverless **1.3+** that makes it easier to package multiple lambda functions written in python.

# What's new?
- Since **0.1.6** python3.6  is supported.
- Since **0.1.5** lambda functions placed under subdirectories are supported.

# Why do I need it?
Say you have multiple lambda functions and each of them has fairly different package requirements. It's not economical to pack all dependencies in one big fat zip. Instead, this plugin can help to pack lambda functions with their own dependencies if you create **requirements.txt** for every function:

```
project
├── hello
│   ├── handler.py
│   └── requirements.txt
├── world
│   ├── handler.py
│   └── requirements.txt
└── serverless.yml
```

That way, this plugin can help to pack lambda functions with their own dependencies.

Moreover, if you are on a Mac, thanks to [@docker-lambda](https://github.com/lambci/docker-lambda), it can pull packages for Linux x86_64 too. More on that please read [How to install platform-dependent packages](#how-to-install-platform-dependent-packages).

# How?
Be sure that [virtualenv](https://pypi.python.org/pypi/virtualenv/) is installed. Otherwise,

`pip install virtualenv`

Then,

`npm install serverless-python-individually`

Your original **serverless.yml** may look like:

```
functions:
  helloFunc:
    handler: hello/handler.hello
  worldFunc:
    handler: world/handler.world
```

The plugin works by replacing the **real handlers**(e.g. `hello/handler.hello`) with a wrapper generated on the fly(e.g. `hello/wrap.handler`). The real handlers are instead set in **custom.pyIndividually** section.

A modification to **serverless.yml** is needed:

```
package:
  individually: True
  exclude:
    # Exclude everything first.
    - '**/*'
functions:
  helloFunc:
    handler: hello/wrap.handler
    package:
      include:
        - hello/**
  worldFunc:
    handler: world/wrap.handler
    package:
      include:
        - world/**
custom:
  pyIndividually:
    wrap:helloFunc: hello/handler.hello     # mapping to the real handler
    wrap:worldFunnc: world/handler.world    # mapping to the real handler

plugins:
  - serverless-python-individually
```

After **sls deploy**, you end up having many .zip in **.serverless/**. They are the actual artifacts that got uploaded to AWS Lambda by serverless. You can examine their content like:

```
> tar tvzf .serverless/aws-python-dev-helloFunc.zip

hello/handler.py
hello/requirements.txt
hello/wrap.py
hello/lib/pkg_resources/...
hello/lib/requests-2.12.3.dist-info/...
hello/lib/requests/...
hello/lib/...

```

Notice that **wrap.py** and **lib/** are created for you. All dependencies should have been pulled and installed in **lib/**.
This plugin also works for **sls deploy function -f**.


# How to install platform-dependent packages
If you are on a Mac, there're platform-dependent dependencies like *subprocess32*, *bcrypt*, etc., cannot simply be pip installed. One way to get around is to launch a aws-lambda architecture identical EC2 or a VM to do the job. That's inconvenient to say the least. Thanks to [@docker-lambda](https://github.com/lambci/docker-lambda), we can launch a container for the same purpose at our disposal. All you need to do is:

- Make sure [docker](https://docs.docker.com/engine/installation/mac/) is installed and properly set up. I.e. when running `docker version` you should see information about client and server.
- For python2.7, `docker pull lambci/lambda:build-python2.7` to pull the image in advance.
- For python3.6, `docker pull lambci/lambda:build-python3.6` to pull the image in advance.
- Turn on **dockerizedPip** in **serverless.yml**:
    ```
    custom:
        pyIndividually:
            # ...

            # Launches a container for installing packages.
            # The default is False.
            dockerizedPip: True
    ```

# Advanced configuration
There are a couple of configurations that can be handy for you.

### severless.yml
* **wrap.py** and **lib/** are created during packaging in the same directory where the real handler is. If you are not happy about the naming, you can change `wrapName` and `libSubDir`.
* **wrap.py** and **lib/** by default will be deleted after packaging. They can be preserved by setting `cleanup` to False.

```
custom:
  pyIndividually:
    # A ${wrapName}.py will be generated for every function.
    # The default filename is 'wrap.py', but you can change it to avoid name clashes.
    wrapName: wrapFoo

    # pip install packages to ${libSubDir} along with ${wrapNam}.py
    # The default dir is 'lib'.
    # libSubDir: lib

    # Cleanup ${libSubDir} and ${wrapName}.py created by the plugin.
    # The default is True.
    # cleanup: True

    # Mapping to the real handler of every function. In the format:
    # ${wrapName}:function_name: real_handler
    # If there's no mapping for a function, then that function will not be touced by this plugin.
    wrapFoo:helloFunc: hello/handler.hello
    wrapFoo:worldFunnc: world/handler.world

    # See [How to install platform-dependent package]
    # The default is False.
    # dockerizedPip: False

```


### Command line options
You can also overwrite some configurations through extra options when `sls deploy`.

* `--pi-cleanup`/`--pi-no-cleanup` overwrite `cleanup` in serverless.yml.

* `--pi-dockerizedPip`/`--pi-no-dockerizedPip` overwrite `dockerizedPip` in serverless.yml.

* `--pi-disable` skips this plugin.

* Handy but **USE WITH CAUTION**: If `--pi-no-cleanup` was specified previously and you don't want to pull dependencies again, then you can disable this plugin temporarily with `--pi-disable`. sls would pack what's left over in the directory:

```
$> sls deploy --pi-no-cleanup
Now wrap.py and lib/* are not cleaned. You can do some work. Make sure requirements.txt not being changed anyhow.
$> sls deploy --pi-disable
The plugin is disabled for this time. sls should then directly pack wrap.py and lib/* left last time.
```

# Demo
A [demo](https://github.com/cfchou/serverless-python-individually-demo) is there for you to get started.


# Credit
This plugin is heavily influenced by [serverless-wsgi](https://github.com/logandk/serverless-wsgi) from [@logandk](https://github.com/logandk). In fact, the [requirement installer](https://github.com/cfchou/serverless-python-individually/blob/master/requirements.py) is directly borrowed from his repo. If your lambda is a wsgi app, then must check out his work.

Also thanks to [@docker-lambda](https://github.com/lambci/docker-lambda) to provide aws lambda runtime equivalent docker image.


# Note
As of this writing, I just start using serverless **1.3+**. This plugin may or may
not work with other 1.x versions but I haven't tried.







