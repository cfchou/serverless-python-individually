#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
This module loads a `requirements.txt` and uses `virtualenv`/`pip` to
install the required Python packages into the specified directory.

Inspired by: https://github.com/awslabs/chalice

Author: Logan Raarup <logan@logan.dk>
"""
import os
import platform
import shutil
import subprocess
import sys


sys_stdout = sys.stdout.buffer if hasattr(sys.stdout, 'buffer') else sys.stdout
sys_stderr = sys.stderr.buffer if hasattr(sys.stderr, 'buffer') else sys.stderr

try:
    import virtualenv
except ImportError:
    sys.exit('Unable to load virtualenv, please install')

if len(sys.argv) < 3:
    sys.exit('Usage: {} REQ_FILE... TARGET_DIR'.format(
        os.path.basename(sys.argv[0])))

REQ_FILES = sys.argv[1:-1]
TARGET_DIR = sys.argv[-1]
VENV_DIR = os.path.join(TARGET_DIR, '.venv')
TMP_DIR = os.path.join(TARGET_DIR, '.tmp')

has_package = False

for req_file in REQ_FILES:
    if not os.path.isfile(req_file):
        sys.exit('No requirements file found in: {}'.format(req_file))

if os.path.exists(TARGET_DIR):
    if not os.path.isdir(TARGET_DIR):
        sys.exit('Existing non-directory found at: {}'.format(TARGET_DIR))
else:
    os.mkdir(TARGET_DIR)

if os.path.exists(VENV_DIR):
    shutil.rmtree(VENV_DIR)

if os.path.exists(TMP_DIR):
    shutil.rmtree(TMP_DIR)

original = sys.argv
sys.argv = ['', VENV_DIR]
try:
    sys_stdout.write('creating virtualenv {}\n'.format(VENV_DIR).encode())
    virtualenv.main()
finally:
    sys.argv = original


if platform.system() == 'Windows':
    pip_exe = os.path.join(VENV_DIR, 'Scripts', 'pip.exe')
    deps_dir = os.path.join(VENV_DIR, 'Lib', 'site-packages')
else:
    pip_exe = os.path.join(VENV_DIR, 'bin', 'pip')
    python_dir = os.listdir(os.path.join(VENV_DIR, 'lib'))[0]
    deps_dir = os.path.join(VENV_DIR, 'lib', python_dir, 'site-packages')

if not os.path.isfile(pip_exe):
    sys.exit('Pip not found in: {}'.format(pip_exe))

for req_file in REQ_FILES:
    p = subprocess.Popen([pip_exe, 'install', '-r', req_file],
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out, err = p.communicate()
    sys_stderr.write(err)
    sys_stdout.write(out)

    if p.returncode != 0:
        sys.exit("Failed to install requirements from: {}".format(
            req_file))

if not os.path.isdir(deps_dir):
    sys.exit('Installed packages not found in: {}'.format(deps_dir))

blacklist = ['pip', 'pip-*', 'wheel', 'wheel-*', 'setuptools', 'setuptools-*',
             'easy_install.*']

sys_stdout.write('copy dependencies to temporary {}\n'.format(TMP_DIR).encode())
shutil.copytree(deps_dir, TMP_DIR, symlinks=False,
                ignore=shutil.ignore_patterns(*blacklist))
for f in os.listdir(TMP_DIR):
    target = os.path.join(TARGET_DIR, f)
    if os.path.isdir(target):
        shutil.rmtree(target)
    elif os.path.exists(target):
        os.remove(target)
    shutil.move(os.path.join(TMP_DIR, f), TARGET_DIR)
    sys_stdout.write('{} created\n'.format(target).encode())

sys_stdout.write('removing virtualenv {}\n'.format(VENV_DIR).encode())
shutil.rmtree(VENV_DIR)
sys_stdout.write('removing temporary {}\n'.format(TMP_DIR).encode())
shutil.rmtree(TMP_DIR)
