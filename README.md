# serverless-python-individually

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)

# What's it?

It's a serverless 1.3 plugin that makes packaging multiple lambda functions written in python easier.


# Why do I need it?

Say you have multiple lambda functions and each of them has fairly different package requirements.
It's not economical to pack all dependencies in one big fat zip. Instead, you
can specify requirements.txt in every function:

```
project
├── hello
|   ├── handler.py
|   └── requirements.txt
├── world
|   ├── handler.py
|   └── requirements.txt
└── serverless.yml
```

Then, this plugin helps to pack lambda functions with their own dependencies.

# How?
In **serverless.yml**:
```
package:
  individually: True
  exclude:
    - '**/*'

functions:
  hello:
    # Specify the wrapping handler in the format:
    # ${function_dir}/${wrapName}.handler
    # The real handler is instead set in custom.pyIndividually.${wrapName}:${function}.
    handler: hello/wrap.handler
    package:
      include:
          - hello/**

  world:
    handler: world/handler.world
    package:
      include:
          - world/**

custom:
  pyIndividually:
    # a ${wrapName}.py will be generated for every function.
    # The default is 'wrap'.
    wrapName: wrap
    # pip install to ${libSubDir} in the dir that the real function handler
    # resides. The default is 'lib'.
    # e.g. for function "hello", pip install -t hello/${libSubDir}
    libSubDir: lib
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

After **sls deploy -v**, you end up having multiple **.zip** in **.serverless/**.

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


# Credit
This plugin heavily influenced by @logandk [serverless-wsgi](https://github.com/logandk/serverless-wsgi).
In fact, the [python requirement installer](https://github.com/logandk/serverless-wsgi/blob/master/requirements.py) is directly taken from his repo.




