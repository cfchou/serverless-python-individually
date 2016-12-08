# serverless-python-individually

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)

# What's it?

It's a simple plugin for serverless **1.3** that makes it easier to package multiple lambda functions written in python.


# Why do I need it?

Say you have multiple lambda functions and each of them has fairly different package requirements.
It's not economical to pack all dependencies in one big fat zip. Instead, you
can create **requirements.txt** for every function:

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

# How?

Be sure that [virtualenv](https://pypi.python.org/pypi/virtualenv/) is installed. Otherwise,
> pip install virtualenv


Then, in **serverless.yml**(use the directory above as an example):
```
package:
  individually: True
  exclude:
    # Exclude everything first.
    - '**/*'

functions:
  hello:
    # Specify wrapping handlers in the format:
    # ${function_dir}/${wrapName}.handler
    # The real handler is instead set to custom.pyIndividually.${wrapName}:${function}.
    handler: hello/wrap.handler
    package:
      include:
          - hello/**

  world:
    handler: world/wrap.handler
    package:
      include:
          - world/**

custom:
  pyIndividually:
    # A ${wrapName}.py will be generated for every function.
    # The default filename is 'wrap.py', but you can change it if that conflicts.
    wrapName: wrap

    # pip install packages to ${libSubDir} 
    # The default is 'lib'.
    libSubDir: lib

    # Note ${wrapName}.py and ${libSubDir} will sit in the same directory where the real handler resides.

    # Cleanup artifacts(${libSubDir}, ${wrapName}.py) created by the plugin.
    # The default is true.
    cleanup: True

    # Mapping to the real handler of every function in the format:
    # ${wrapName}:${function}: ${real_handler}
    wrap:hello: hello/handler.hello
    wrap:world: world/handler.world

plugins:
  - serverless-python-individually

```

After **sls deploy -v**, you end up having many .zip in **.serverless/**.
You can examine their content like:

```
> tar tvzf .serverless/aws-python-devcf1612-hello.zip

hello/handler.py
hello/requirements.txt
hello/wrap.py
hello/lib/pkg_resources/...
hello/lib/requests-2.12.3.dist-info/...
hello/lib/requests/...
hello/lib/...

```

Notice that **wrap.py** and **lib/** are created for you.

This plugin also works for **sls deploy function -f hello**, only that the
whole .serverless directory will be deleted by the framework so you can't examine the .zip.

# Credit
This plugin is heavily influenced by [serverless-wsgi](https://github.com/logandk/serverless-wsgi) from [@logandk](https://github.com/logandk).
In fact, the [requirement installer](https://github.com/cfchou/serverless-python-individually/blob/master/requirements.py) is directly borrowed from his repo.
If your lambda is a wsgi app, then must check out his work.


# Note
As of this writing, I just start using serverless **1.3**. This plugin may or may
not work with other 1.x versions but I haven't tried. 







